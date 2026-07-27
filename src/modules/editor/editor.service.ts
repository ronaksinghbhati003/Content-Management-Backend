import { Types } from 'mongoose';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import EditorProject, { IEditorProject } from './editor.schema';
import Upload from '../upload/upload.schema';
import { uploadService } from '../upload/upload.service';
import { NotFoundException, BadRequestException, InternalServerException } from '../../shared/http-exception';
import { downloadAndCutYouTubeClip, resolveUserCookiesFile } from '../publish/youtube-download.util';
import { transcribeVideo, renderProject, generateAssFile, getVideoDurationSec } from './editor.ffmpeg';
import { CreateEditorProjectInput, UpdateEdlInput, UpdateCaptionsInput, UpdateDetailsInput } from './editor.z.schema';
import config from '../../config';
import logger from '../../config/logger';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const SCRATCH_DIR = path.join(UPLOADS_DIR, '.editor-scratch');

function uploadPublicUrl(fileName: string): string {
    return `${config.serverBaseUrl}/uploads/${fileName}`;
}

export class EditorService {
    private async getOwnedProject(userId: string, id: string): Promise<IEditorProject> {
        const project = await EditorProject.findOne({
            _id: new Types.ObjectId(id),
            userId: new Types.ObjectId(userId),
        });
        if (!project) {
            throw new NotFoundException('Editor project not found');
        }
        return project;
    }

    /**
     * Creates a project either from an existing upload (raw footage the user already
     * has in their library — fast, returns 'draft' immediately) or, for the AI hand-off
     * path, from a YouTube source URL + timestamp range. The YouTube path returns a
     * 'downloading' placeholder project right away and materializes the clip (yt-dlp +
     * ffmpeg cut) in the background, mirroring publish.service.ts's fire-and-forget
     * pattern — the frontend polls GET /editor/get/:id until renderStatus clears.
     */
    async createProject(userId: string, input: CreateEditorProjectInput): Promise<IEditorProject> {
        if (input.sourceUploadId) {
            const upload = await Upload.findOne({
                _id: new Types.ObjectId(input.sourceUploadId),
                userId: new Types.ObjectId(userId),
            });
            if (!upload) {
                throw new NotFoundException('Upload not found. Please upload a video first.');
            }
            const sourceUploadId = upload._id as Types.ObjectId;
            const videoPath = path.join(UPLOADS_DIR, upload.fileName);
            const durationSec = upload.duration || await getVideoDurationSec(videoPath);
            if (!upload.duration) {
                upload.duration = durationSec;
                await upload.save();
            }

            const project = new EditorProject({
                userId: new Types.ObjectId(userId),
                sourceUploadId,
                contentId: input.contentId ? new Types.ObjectId(input.contentId) : null,
                edl: { clips: [{ uploadId: sourceUploadId, start: 0, end: durationSec, speed: 1 }] },
                captionTrack: [],
                title: input.title || '',
                description: input.description || '',
                hashtags: input.hashtags || [],
                renderStatus: 'draft',
            });
            return project.save();
        }

        // AI hand-off path — placeholder row first, download happens in the background.
        const project = new EditorProject({
            userId: new Types.ObjectId(userId),
            contentId: input.contentId ? new Types.ObjectId(input.contentId) : null,
            edl: { clips: [] },
            captionTrack: [],
            title: input.title || '',
            description: input.description || '',
            hashtags: input.hashtags || [],
            renderStatus: 'downloading',
            renderProgress: 0,
        });
        const saved = await project.save();

        this.materializeYouTubeClip(saved._id.toString(), userId, input).catch((err) => {
            logger.error(`[Editor] Failed to materialize YouTube clip for project ${saved._id}: ${err.message}`);
        });

        return saved;
    }

    /**
     * Background half of the AI hand-off path: downloads + cuts the YouTube
     * range via yt-dlp/ffmpeg, registers it as an Upload, and flips the
     * project from 'downloading' to 'draft' (or 'failed') once done.
     *
     * Wrapped in a hard overall timeout so a stuck child process (e.g. an
     * ffmpeg probe whose stdout nobody drains, deadlocking on a full pipe
     * buffer) can never leave a project stuck in 'downloading' forever —
     * this is a belt-and-suspenders guard on top of the per-step timeouts
     * inside downloadAndCutYouTubeClip/getVideoDurationSec.
     */
    private async materializeYouTubeClip(projectId: string, userId: string, input: CreateEditorProjectInput): Promise<void> {
        const OVERALL_TIMEOUT_MS = 12 * 60 * 1000; // 12 min — above the 3+8 min yt-dlp retry chain
        try {
            await Promise.race([
                this.doMaterializeYouTubeClip(projectId, userId, input),
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error(`Timed out after ${OVERALL_TIMEOUT_MS / 60000} minutes`)),
                    OVERALL_TIMEOUT_MS
                )),
            ]);
        } catch (err: any) {
            await EditorProject.updateOne({ _id: new Types.ObjectId(projectId) }, {
                $set: { renderStatus: 'failed', renderError: `Clip download failed: ${err.message}` },
            });
            throw err;
        }
    }

    private async doMaterializeYouTubeClip(projectId: string, userId: string, input: CreateEditorProjectInput): Promise<void> {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        const cookiesFilePath = await resolveUserCookiesFile(userId);
        const downloadedPath = await downloadAndCutYouTubeClip(
            input.sourceUrl!,
            input.timestampStart!,
            input.timestampEnd!,
            UPLOADS_DIR,
            // Convert to the 9:16 canvas up front: the only caller of this
            // YouTube hand-off path is the Shorts/Reels editor, and publishing
            // from here now ships this exact rendered file (not a re-derived
            // YouTube download) — so what's edited must already be the real
            // vertical frame, not a landscape preview that diverges from the
            // published result.
            true,
            input.verticalStyle || 'pillarbox',
            (pct: number) => {
                EditorProject.updateOne({ _id: new Types.ObjectId(projectId) }, { $set: { renderProgress: pct } }).catch(() => {});
            },
            cookiesFilePath
        );
        const fileName = path.basename(downloadedPath);
        const stats = fs.statSync(downloadedPath);
        const durationSec = await getVideoDurationSec(downloadedPath);

        const newUpload = await uploadService.createUpload(userId, {
            originalName: `YouTube clip (${input.timestampStart}-${input.timestampEnd}).mp4`,
            fileName,
            mimeType: 'video/mp4',
            size: stats.size,
            url: uploadPublicUrl(fileName),
        });
        const sourceUploadId = newUpload._id as Types.ObjectId;

        await EditorProject.updateOne({ _id: new Types.ObjectId(projectId) }, {
            $set: {
                sourceUploadId,
                edl: { clips: [{ uploadId: sourceUploadId, start: 0, end: durationSec, speed: 1 }] },
                renderStatus: 'draft',
                renderProgress: 100,
                renderError: null,
            },
        });
    }

    async getProject(userId: string, id: string): Promise<IEditorProject> {
        const project = await EditorProject.findOne({
            _id: new Types.ObjectId(id),
            userId: new Types.ObjectId(userId),
        })
            .populate('sourceUploadId', 'url fileName duration')
            .populate('outputUploadId', 'url fileName');

        if (!project) {
            throw new NotFoundException('Editor project not found');
        }
        return project;
    }

    async updateEdl(userId: string, id: string, edl: UpdateEdlInput): Promise<IEditorProject> {
        const project = await this.getOwnedProject(userId, id);
        project.edl = edl as any;
        return project.save();
    }

    async updateCaptions(userId: string, id: string, input: UpdateCaptionsInput): Promise<IEditorProject> {
        const project = await this.getOwnedProject(userId, id);
        project.captionTrack = input.captionTrack as any;
        return project.save();
    }

    /** Updates the publish metadata (title/description/hashtags) for a project. */
    async updateDetails(userId: string, id: string, input: UpdateDetailsInput): Promise<IEditorProject> {
        const project = await this.getOwnedProject(userId, id);
        if (input.title !== undefined) project.title = input.title;
        if (input.description !== undefined) project.description = input.description;
        if (input.hashtags !== undefined) project.hashtags = input.hashtags;
        return project.save();
    }

    /** Extracts audio and transcribes it word-by-word via Groq, replacing the caption track. */
    async transcribe(userId: string, id: string): Promise<IEditorProject> {
        const project = await this.getOwnedProject(userId, id);
        if (project.renderStatus === 'downloading') {
            throw new BadRequestException('Clip is still downloading — try again once it finishes.');
        }
        const upload = await Upload.findById(project.sourceUploadId);
        if (!upload) {
            throw new NotFoundException('Source upload for this project no longer exists');
        }

        project.renderStatus = 'transcribing';
        await project.save();

        try {
            const videoPath = path.join(UPLOADS_DIR, upload.fileName);
            const captionTrack = await transcribeVideo(videoPath, SCRATCH_DIR);
            project.captionTrack = captionTrack as any;
            project.renderStatus = 'draft';
            project.renderError = null;
            return await project.save();
        } catch (err: any) {
            project.renderStatus = 'failed';
            project.renderError = `Transcription failed: ${err.message}`;
            await project.save();
            logger.error(`[Editor] Transcription failed for project ${id}: ${err.message}`);
            throw new InternalServerException(project.renderError);
        }
    }

    /**
     * Renders the final MP4 (trim/split/speed/reorder + caption burn-in), registers it
     * as a new Upload, and links it back to the project. Runs synchronously within the
     * request, matching the codebase's existing render pattern (publish.service.ts).
     */
    async render(userId: string, id: string): Promise<IEditorProject> {
        const project = await this.getOwnedProject(userId, id);
        if (project.renderStatus === 'downloading') {
            throw new BadRequestException('Clip is still downloading — try again once it finishes.');
        }
        const upload = await Upload.findById(project.sourceUploadId);
        if (!upload) {
            throw new NotFoundException('Source upload for this project no longer exists');
        }
        if (project.edl.clips.length === 0) {
            throw new BadRequestException('Project has no clips to render');
        }

        project.renderStatus = 'rendering';
        project.renderProgress = 0;
        await project.save();

        if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });
        const sourceVideoPath = path.join(UPLOADS_DIR, upload.fileName);
        const assFilePath = project.captionTrack.length > 0
            ? path.join(SCRATCH_DIR, `captions_${id}_${Date.now()}.ass`)
            : null;
        const outFileName = `edit-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.mp4`;
        const outPath = path.join(UPLOADS_DIR, outFileName);

        try {
            if (assFilePath) generateAssFile(project.captionTrack, assFilePath);

            await renderProject(sourceVideoPath, project.edl.clips, assFilePath, outPath, (pct) => {
                EditorProject.updateOne({ _id: project._id }, { $set: { renderProgress: pct } }).catch(() => {});
            });

            const stats = fs.statSync(outPath);
            const outputUpload = await uploadService.createUpload(userId, {
                originalName: `${upload.originalName} (edited)`,
                fileName: outFileName,
                mimeType: 'video/mp4',
                size: stats.size,
                url: uploadPublicUrl(outFileName),
            });

            project.outputUploadId = outputUpload._id as Types.ObjectId;
            project.renderStatus = 'ready';
            project.renderProgress = 100;
            project.renderError = null;
            return await project.save();
        } catch (err: any) {
            project.renderStatus = 'failed';
            project.renderError = `Render failed: ${err.message}`;
            await project.save();
            logger.error(`[Editor] Render failed for project ${id}: ${err.message}`);
            throw new InternalServerException(project.renderError);
        } finally {
            if (assFilePath) fs.unlink(assFilePath, () => {});
        }
    }
}

export const editorService = new EditorService();
