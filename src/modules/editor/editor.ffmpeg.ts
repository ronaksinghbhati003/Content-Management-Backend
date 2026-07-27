import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import config from '../../config';
import logger from '../../config/logger';
import { resolveFfmpegPath } from '../publish/youtube-download.util';
import { IEditorCaption, IEditorClip, IEditorWord } from './editor.schema';

const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000; // 10 min hard cap — renders can involve several clips + a subtitles pass

// Cues break on a pause between words longer than this, or once a line gets long
// enough that holding it as one caption would stop reading as "word-accurate".
const CUE_PAUSE_BREAK_SEC = 0.6;
const CUE_MAX_WORDS = 8;
const CUE_MAX_DURATION_SEC = 4;

function runFfmpeg(ffmpegPath: string, args: string[], onProgress?: (pct: number) => void, totalDurationSec?: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args);

        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS / 60000} minutes`));
        }, FFMPEG_TIMEOUT_MS);

        let stderr = '';
        ffmpeg.stderr.on('data', (d: Buffer) => {
            stderr += d.toString();
            if (onProgress && totalDurationSec) {
                const m = stderr.match(/time=(\d+):(\d+):(\d+)/);
                if (m) {
                    const elapsed = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
                    onProgress(Math.min(100, Math.round((elapsed / totalDurationSec) * 100)));
                }
            }
        });
        // Drain stdout so an unexpected write there can never fill the pipe
        // buffer and block ffmpeg from ever reaching 'close'.
        ffmpeg.stdout?.on('data', () => {});
        ffmpeg.on('close', (code: number) => {
            clearTimeout(timeout);
            code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
        });
        ffmpeg.on('error', reject);
    });
}

/**
 * Reads a video's duration without ffprobe (not part of @ffmpeg-installer/ffmpeg) —
 * ffmpeg itself prints "Duration: HH:MM:SS.xx" to stderr while probing the input,
 * even when told to produce no output (`-f null -`), so a non-zero exit here is
 * expected and ignored; only the parsed duration matters.
 */
export async function getVideoDurationSec(videoPath: string): Promise<number> {
    const ffmpegPath = await resolveFfmpegPath();
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, ['-i', videoPath, '-f', 'null', '-']);

        // Hard cap so a probe can never hang a background job indefinitely.
        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error('Duration probe timed out after 30s'));
        }, 30 * 1000);

        let stderr = '';
        ffmpeg.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        // The null muxer can still write to stdout on some ffmpeg builds — if
        // nothing reads it, the OS pipe buffer fills and ffmpeg blocks on
        // write() forever, so 'close' never fires. Drain it unconditionally.
        ffmpeg.stdout?.on('data', () => {});
        ffmpeg.on('close', () => {
            clearTimeout(timeout);
            const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
            if (!m) return reject(new Error('Could not determine video duration'));
            resolve(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
        });
        ffmpeg.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/** Extracts a small mono 16kHz audio track — everything Whisper-class ASR needs, nothing more. */
export async function extractAudio(videoPath: string, outPath: string): Promise<void> {
    const ffmpegPath = await resolveFfmpegPath();
    await runFfmpeg(ffmpegPath, ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-y', outPath]);
}

interface GroqWord { text: string; start: number; end: number }

/**
 * Sends an audio file to Groq's Whisper endpoint and asks for word-level timestamps.
 * Uses Node's built-in fetch/FormData/Blob rather than adding an SDK dependency —
 * this is a single, simple multipart request.
 */
async function transcribeAudioWithGroq(audioPath: string): Promise<GroqWord[]> {
    if (!config.groqApiKey) {
        throw new Error('GROQ_API_KEY is not configured');
    }

    const audioBuffer = fs.readFileSync(audioPath);
    const form = new FormData();
    form.append('file', new Blob([audioBuffer]), path.basename(audioPath));
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.groqApiKey}` },
        body: form,
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Groq transcription failed (${res.status}): ${errBody.slice(-500)}`);
    }

    const data = (await res.json()) as { words?: any[] };
    const words: any[] = data.words || [];
    return words.map((w) => ({ text: String(w.word ?? w.text ?? '').trim(), start: w.start, end: w.end })).filter((w) => w.text);
}

/** Groups a flat word list into short caption cues by pause length and line length. */
function groupWordsIntoCaptions(words: GroqWord[]): IEditorCaption[] {
    const cues: IEditorCaption[] = [];
    let current: IEditorWord[] = [];

    const flush = () => {
        if (current.length === 0) return;
        cues.push({
            start: current[0].start,
            end: current[current.length - 1].end,
            text: current.map((w) => w.text).join(' '),
            words: current,
            style: 'clean',
        });
        current = [];
    };

    for (const word of words) {
        const prev = current[current.length - 1];
        const pauseBreak = prev && word.start - prev.end > CUE_PAUSE_BREAK_SEC;
        const durationBreak = current.length > 0 && word.end - current[0].start > CUE_MAX_DURATION_SEC;
        const lengthBreak = current.length >= CUE_MAX_WORDS;

        if (pauseBreak || durationBreak || lengthBreak) flush();
        current.push(word);
    }
    flush();

    return cues;
}

export async function transcribeVideo(videoPath: string, scratchDir: string): Promise<IEditorCaption[]> {
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    const audioPath = path.join(scratchDir, `audio_${Date.now()}.mp3`);

    try {
        await extractAudio(videoPath, audioPath);
        const words = await transcribeAudioWithGroq(audioPath);
        return groupWordsIntoCaptions(words);
    } finally {
        fs.unlink(audioPath, () => {});
    }
}

function formatAssTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds - Math.floor(seconds)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/** Builds a per-word karaoke-highlight line using ASS's native \k timing tags. */
function buildKaraokeLine(cue: IEditorCaption): string {
    return cue.words
        .map((w) => {
            const centiseconds = Math.max(1, Math.round((w.end - w.start) * 100));
            return `{\\k${centiseconds}}${escapeAssText(w.text)} `;
        })
        .join('')
        .trim();
}

/**
 * Writes an .ass subtitle file for the given caption track. Two starter styles for
 * Phase 1: a plain static line ("clean"), and a word-by-word karaoke highlight
 * ("karaoke") built on ASS's native \k timing tags — not a burn-in hack, this is
 * exactly what libass (which ffmpeg's `subtitles` filter uses) is designed for.
 */
export function generateAssFile(captionTrack: IEditorCaption[], outPath: string): void {
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Clean,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,1,3,1,2,60,60,120
Style: Karaoke,Arial,64,&H00FFFFFF,&H0000D7FF,&H00000000,&H80000000,1,0,1,3,1,2,60,60,120

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const lines = captionTrack.map((cue) => {
        const start = formatAssTimestamp(cue.start);
        const end = formatAssTimestamp(cue.end);
        const text = cue.style === 'karaoke' && cue.words.length > 0
            ? buildKaraokeLine(cue)
            : escapeAssText(cue.text);
        const styleName = cue.style === 'karaoke' ? 'Karaoke' : 'Clean';
        return `Dialogue: 0,${start},${end},${styleName},,0,0,0,,${text}`;
    });

    fs.writeFileSync(outPath, header + lines.join('\n') + '\n', 'utf-8');
}

/** Escapes an absolute path for use inside an ffmpeg filtergraph's subtitles=<path> argument. */
function escapeFilterPath(filePath: string): string {
    return filePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Builds the filter_complex graph that trims/speeds/concatenates an ordered list of
 * clips from a single source input (input index 0 — Phase 1 assumes one source
 * video per project). Audio speed uses `atempo` (real time-stretch, pitch-preserved)
 * rather than scaling asetpts, which would just desync audio from video.
 */
function buildFilterGraph(clips: IEditorClip[]): { filterComplex: string; videoLabel: string; audioLabel: string } {
    const segments = clips.map((clip, i) => {
        const speed = clip.speed || 1;
        const video = `[0:v]trim=start=${clip.start}:end=${clip.end},setpts=(1/${speed})*(PTS-STARTPTS)[v${i}]`;
        const audio = `[0:a]atrim=start=${clip.start}:end=${clip.end},asetpts=PTS-STARTPTS,atempo=${speed}[a${i}]`;
        return `${video};${audio}`;
    });

    const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('');
    const concat = `${concatInputs}concat=n=${clips.length}:v=1:a=1[vout][aout]`;

    return { filterComplex: `${segments.join(';')};${concat}`, videoLabel: '[vout]', audioLabel: '[aout]' };
}

function totalOutputDuration(clips: IEditorClip[]): number {
    return clips.reduce((sum, c) => sum + (c.end - c.start) / (c.speed || 1), 0);
}

/**
 * Renders the final MP4: trims/concatenates the given clips from one source video,
 * then (if provided) burns in the caption track via an .ass file. Single ffmpeg
 * process, run synchronously within the request per Phase 1's accepted render model.
 */
export async function renderProject(
    sourceVideoPath: string,
    clips: IEditorClip[],
    assFilePath: string | null,
    outPath: string,
    onProgress?: (pct: number) => void
): Promise<void> {
    const ffmpegPath = await resolveFfmpegPath();
    const { filterComplex, videoLabel, audioLabel } = buildFilterGraph(clips);

    let finalFilterComplex = filterComplex;
    let mapVideoLabel = videoLabel;

    if (assFilePath) {
        mapVideoLabel = '[vcap]';
        finalFilterComplex += `;${videoLabel}subtitles='${escapeFilterPath(assFilePath)}'${mapVideoLabel}`;
    }

    const args = [
        '-i', sourceVideoPath,
        '-filter_complex', finalFilterComplex,
        '-map', mapVideoLabel,
        '-map', audioLabel,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-y',
        outPath,
    ];

    logger.info(`[Editor] Rendering ${clips.length} clip(s) → ${outPath}`);
    await runFfmpeg(ffmpegPath, args, onProgress, totalOutputDuration(clips));
}
