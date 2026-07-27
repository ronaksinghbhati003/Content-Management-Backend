import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import User from '../Auth/user.schema';
import logger from '../../config/logger';
import { detectFaceCenterX } from '../ai/ai.service';

// yt-dlp is installed via `pip3 install --user`, which doesn't land on PATH for
// every process that spawns this server (IDE tasks, cron, deploy). Resolve an
// absolute path the same way @ffmpeg-installer/ffmpeg does, instead of trusting PATH.
export function resolveYtDlpPath(): string {
    if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
        return process.env.YT_DLP_PATH;
    }
    const candidates = [
        path.join(os.homedir(), 'Library/Python/3.9/bin/yt-dlp'), // pip3 install --user (macOS)
        path.join(os.homedir(), '.local/bin/yt-dlp'),              // pip3 install --user (Linux)
        '/opt/homebrew/bin/yt-dlp',
        '/usr/local/bin/yt-dlp',
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return 'yt-dlp'; // fall back to PATH lookup
}

// Materializes a user's saved cookies.txt content to disk so yt-dlp can read it via
// --cookies. Written outside `uploads/` since that directory is served publicly.
// Per-user: one account's missing/expired cookies only affects their own downloads.
export async function resolveUserCookiesFile(userId?: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await User.findById(userId).select('+ytDlpCookiesText');
    if (!user?.ytDlpCookiesText) return null;

    const cookiesDir = path.resolve(process.cwd(), 'cookies');
    if (!fs.existsSync(cookiesDir)) fs.mkdirSync(cookiesDir, { recursive: true });

    const filePath = path.join(cookiesDir, `${userId}.txt`);
    fs.writeFileSync(filePath, user.ytDlpCookiesText);
    return filePath;
}

// Resolves the absolute path to the prebuilt ffmpeg binary shipped by
// @ffmpeg-installer/ffmpeg. Shared by every module that spawns ffmpeg directly
// (this file, and the editor module's render pipeline) so there's one place
// that knows how the binary is located.
export async function resolveFfmpegPath(): Promise<string> {
    const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
    return ffmpegInstaller.path;
}

export function tsToSeconds(ts: string): number {
    if (!ts) return 0;
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

// Grabs a handful of still frames from the middle of the clip (10%/30%/50%/70%/90%
// of its duration — avoiding the very start/end where cuts/transitions are more
// likely) for face-position analysis. Each is a cheap seek + single-frame decode,
// not a re-encode, and all run in parallel since they're read-only seeks into the
// same file.
async function extractSampleFrames(ffmpegPath: string, videoPath: string, clipSec: number, outDir: string): Promise<string[]> {
    const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
    const ts = Date.now();

    const grabs = fractions.map((frac, i) => {
        const outPath = path.join(outDir, `face_sample_${ts}_${i}.jpg`);
        const offsetSec = Math.max(0, frac * clipSec);
        return new Promise<string | null>((resolve) => {
            const ffmpeg = spawn(ffmpegPath, [
                '-ss', String(offsetSec),
                '-i', videoPath,
                '-vframes', '1',
                '-q:v', '4',
                '-y',
                outPath,
            ]);
            ffmpeg.stdout?.on('data', () => {});
            ffmpeg.stderr?.on('data', () => {});
            ffmpeg.on('close', (code: number) => resolve(code === 0 && fs.existsSync(outPath) ? outPath : null));
            ffmpeg.on('error', () => resolve(null));
        });
    });

    const results = await Promise.all(grabs);
    return results.filter((p): p is string => !!p);
}

// Face-aware crop position for the vertical-conversion filter below — returns a
// fraction in [0,1] (0.5 = dead center, today's previous behavior). Never throws:
// any failure anywhere in this chain (frame extraction, Gemini call, parsing)
// falls back to plain center-crop rather than risk stalling or failing a publish
// job over a cosmetic enhancement.
async function computeFaceAwareCropX(ffmpegPath: string, videoPath: string, clipSec: number, outDir: string): Promise<number> {
    let framePaths: string[] = [];
    try {
        framePaths = await extractSampleFrames(ffmpegPath, videoPath, clipSec, outDir);
        const cx = await detectFaceCenterX(framePaths);
        return cx ?? 0.5;
    } catch (err: any) {
        logger.warn(`[Clip] Face-aware crop detection failed, using center crop: ${err.message}`);
        return 0.5;
    } finally {
        framePaths.forEach((p) => fs.unlink(p, () => {}));
    }
}

/**
 * Downloads the [timestampStart, timestampEnd) section of a YouTube video and,
 * optionally, converts it to a 9:16 vertical canvas — either a blurred
 * pillarbox background (nothing cropped, letterboxed) or a full-bleed crop
 * (fills the whole frame, edges trimmed). Shared by the publish module
 * (schedule-to-platform clips) and the editor module (turning an AI-suggested
 * clip into local footage to edit).
 */
export async function downloadAndCutYouTubeClip(
    sourceUrl: string,
    timestampStart: string,
    timestampEnd: string,
    outDir: string,
    convertToVertical = false,
    verticalStyle: 'pillarbox' | 'fill' = 'pillarbox',
    onProgress?: (pct: number) => void,
    cookiesFilePath?: string | null
): Promise<string> {
    const ffmpegPath = await resolveFfmpegPath();
    const ffmpegDir  = path.dirname(ffmpegPath);

    const startSec   = tsToSeconds(timestampStart);
    const endSec     = tsToSeconds(timestampEnd);
    const clipSec    = Math.max(1, endSec - startSec);
    const ts         = Date.now();
    const landscape  = path.join(outDir, `clip_land_${ts}.mp4`);
    const vertical   = path.join(outDir, `clip_vert_${ts}.mp4`);

    const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000; // 5 min hard cap

    // Runs yt-dlp with the given args and resolves once the file is written, or
    // rejects on non-zero exit / timeout.
    const runYtDlp = (extraArgs: string[], timeoutMs: number): Promise<void> =>
        new Promise((resolve, reject) => {
            const args = [
                '--download-sections', `*${startSec}-${endSec}`,
                '--force-keyframes-at-cuts',
                // Explicitly avoid AV1 (av01) video streams. --force-keyframes-at-cuts
                // needs frame-accurate cuts, which for AV1 sources forces yt-dlp to
                // transcode av1->h264 during the trim step — and that specific
                // transcode+trim combination hits a real ffmpeg bug ("Value ... for
                // parameter 'durationi' out of range", "Error reinitializing filters")
                // that crashes the whole download. h264 (avc1) sources trim cleanly.
                // Only fall back to AV1 if literally nothing else is available.
                '-f', 'bestvideo[ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]/best[ext=mp4][vcodec!*=av01]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--merge-output-format', 'mp4',
                '--ffmpeg-location', ffmpegDir,
                // Needed to solve YouTube's "n" parameter challenge on DASH stream
                // URLs — without a JS runtime, yt-dlp silently drops those formats.
                // This IS a Node process, so its own binary is always available.
                '--js-runtimes', `node:${process.execPath}`,
                '-o', landscape,
                '--no-playlist',
                '--no-warnings',
                ...extraArgs,
                sourceUrl,
            ];
            const ytDlp = spawn(resolveYtDlpPath(), args);

            const timeout = setTimeout(() => {
                ytDlp.kill('SIGKILL');
                reject(new Error(`yt-dlp timed out after ${timeoutMs / 60000} minutes`));
            }, timeoutMs);

            // Parse yt-dlp progress lines like "[download]  42.3% of ..."
            let stderr = '';
            ytDlp.stdout?.on('data', (d: Buffer) => {
                const line = d.toString();
                const m = line.match(/\[download\]\s+([\d.]+)%/);
                if (m) {
                    const dlPct = parseFloat(m[1]);
                    // Map 0-100% download → 2-18% total progress
                    onProgress?.(2 + Math.round(dlPct * 0.16));
                }
            });
            ytDlp.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
            ytDlp.on('close', (code: number) => {
                clearTimeout(timeout);
                code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(-500)}`));
            });
            ytDlp.on('error', reject);
        });

    // Step 1 — yt-dlp: download only the time slice
    onProgress?.(2); // signal download started
    logger.info(`[Clip] Downloading ${clipSec}s clip from ${sourceUrl} [${timestampStart}→${timestampEnd}]`);

    // mweb/web_creator/android_vr avoid the SABR-forced streaming YouTube now
    // applies to the plain web/tv/android clients on many videos — SABR
    // responses have no direct stream URL, so yt-dlp just drops those formats
    // and quietly falls back to the old 360p-only "18" format. These clients
    // still benefit from a PO token (via the bgutil provider, see
    // bgutil-ytdlp-pot-provider) but don't require one to expose up to 1080p.
    const HQ_CLIENTS = 'mweb,web_creator,android_vr,web,tv,web_safari,android';

    if (cookiesFilePath) {
        // Higher-quality path: authenticated clients can unlock higher tiers /
        // age-gated content, but some streams are HLS (m3u8) — segment-by-segment
        // downloads that can stall or hit YouTube's rate-limit sleeps, especially
        // on longer clips. Bound this attempt tightly and fall back to the
        // always-reliable android path rather than let a whole publish job hang
        // for many minutes.
        try {
            await runYtDlp([
                '--extractor-args', `youtube:player_client=${HQ_CLIENTS}`,
                '--cookies', cookiesFilePath,
            ], 3 * 60 * 1000);
        } catch (err: any) {
            logger.warn(`[Clip] High-quality download failed/stalled (${err.message}), retrying without cookies`);
            fs.rm(landscape, { force: true }, () => {});
            await runYtDlp(['--extractor-args', `youtube:player_client=${HQ_CLIENTS}`], 8 * 60 * 1000);
        }
    } else {
        await runYtDlp(['--extractor-args', `youtube:player_client=${HQ_CLIENTS}`], 8 * 60 * 1000);
    }

    onProgress?.(20); // download done
    logger.info(`[Clip] Download complete. Converting to vertical: ${convertToVertical} (${verticalStyle})`);

    if (!convertToVertical) return landscape;

    // Step 2 — ffmpeg: convert 16:9 → 9:16 vertical at 1080p (native Shorts/Reels/TikTok
    // canvas size). Output resolution is independent of the source download quality —
    // if the source landscape clip came in below 1080p (e.g. the 360p fallback path),
    // the foreground is upscaled to fit this canvas rather than gaining real detail,
    // but delivering at the platforms' native size avoids an extra platform-side
    // upscale/re-encode pass on top.
    //
    // 'pillarbox': nothing cropped — the full frame is shrunk to fit width-wise and
    //   letterboxed top/bottom against a blurred, zoomed copy of itself as filler.
    // 'fill': the frame is scaled up and center-cropped to fill 1080x1920 edge to
    //   edge — no bars, but the left/right (or top/bottom) edges of the source are cut off.
    //
    // The crop's x-offset is face-aware rather than a blind center-crop: a few
    // sample frames are analyzed for the primary face's horizontal position, and
    // the crop window is shifted to keep it in frame. `cx` defaults to 0.5 (dead
    // center) on any failure or when no face is found — mathematically identical
    // to the previous unconditional center-crop, so nothing regresses for b-roll
    // or no-face clips. Only 'fill' actually loses content off-screen; 'pillarbox'
    // gets the same treatment for its blurred backdrop, though its foreground is
    // never cropped either way.
    onProgress?.(21);
    const cx = await computeFaceAwareCropX(ffmpegPath, landscape, clipSec, outDir);
    const cropX = `min(max(iw*${cx}-540\\,0)\\,iw-1080)`;
    onProgress?.(22);

    const filterComplex = verticalStyle === 'fill'
        ? `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:x='${cropX}':y=0[v]`
        : `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:x='${cropX}':y=0,boxblur=20:3[bg];` +
          '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];' +
          '[bg][fg]overlay=(W-w)/2:(H-h)/2[v]';

    await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            '-i', landscape,
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-movflags', '+faststart',
            '-y',
            vertical,
        ]);

        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            fs.unlink(landscape, () => {});
            reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS / 60000} minutes`));
        }, FFMPEG_TIMEOUT_MS);

        // Parse ffmpeg progress via time= field: "time=00:01:23.45"
        let stderr = '';
        ffmpeg.stderr.on('data', (d: Buffer) => {
            stderr += d.toString();
            const m = stderr.match(/time=(\d+):(\d+):(\d+)/);
            if (m) {
                const elapsed = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
                const ratio = Math.min(1, elapsed / clipSec);
                // Map 0-100% ffmpeg → 22-28% total progress
                onProgress?.(22 + Math.round(ratio * 6));
            }
        });
        // Drain stdout so an unexpected write there can never fill the pipe
        // buffer and block ffmpeg from ever reaching 'close'.
        ffmpeg.stdout?.on('data', () => {});
        ffmpeg.on('close', (code: number) => {
            clearTimeout(timeout);
            fs.unlink(landscape, () => {});
            code === 0 ? resolve() : reject(new Error(`ffmpeg vertical convert failed (${code}): ${stderr.slice(-500)}`));
        });
        ffmpeg.on('error', reject);
    });

    onProgress?.(30); // conversion done, ready for upload
    logger.info(`[Clip] Vertical conversion done → ${vertical}`);
    return vertical;
}
