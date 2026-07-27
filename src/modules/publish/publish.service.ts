import { Types } from 'mongoose';
import PublishJob, { IPublishJob, IPlatformResult } from './publish.schema';
import Upload from '../upload/upload.schema';
import Content from '../content/content.schema';
import { NotFoundException, BadRequestException } from '../../shared/http-exception';
import { getPlatformAdapter } from './platforms';
import logger from '../../config/logger';
import path from 'path';
import fs from 'fs';
import { downloadAndCutYouTubeClip, resolveUserCookiesFile } from './youtube-download.util';

export interface CreatePublishJobInput {
    uploadId?: string;
    // YouTube clip source fields
    sourceUrl?: string;
    youtubeVideoId?: string;
    timestampStart?: string;
    timestampEnd?: string;
    durationSec?: number;
    verticalStyle?: 'pillarbox' | 'fill';
    title: string;
    description?: string;
    tags?: string[];
    platforms: string[];
    scheduledAt: string;
    thumbnailUrl?: string;
    contentId?: string;
    visibility?: 'public' | 'unlisted' | 'private';
}

export class PublishService {
    /**
     * Create a new publish job
     */
    async createPublishJob(userId: string, data: CreatePublishJobInput): Promise<IPublishJob> {
        const hasYouTubeSource = !!(data.sourceUrl || data.youtubeVideoId);

        if (!hasYouTubeSource) {
            // Legacy path: verify pre-uploaded file exists
            if (!data.uploadId) {
                throw new BadRequestException('Either uploadId or sourceUrl (YouTube clip) is required.');
            }
            const upload = await Upload.findOne({
                _id: new Types.ObjectId(data.uploadId),
                userId: new Types.ObjectId(userId),
            });
            if (!upload) {
                throw new NotFoundException('Upload not found. Please upload a video first.');
            }
        }

        const scheduledAt = new Date(data.scheduledAt);
        const isImmediate = scheduledAt <= new Date();

        const platformResults: IPlatformResult[] = data.platforms.map((platform) => ({
            platform,
            status: 'pending' as const,
        }));

        const job = new PublishJob({
            userId: new Types.ObjectId(userId),
            uploadId: data.uploadId ? new Types.ObjectId(data.uploadId) : null,
            sourceUrl: data.sourceUrl || null,
            youtubeVideoId: data.youtubeVideoId || null,
            timestampStart: data.timestampStart || null,
            timestampEnd: data.timestampEnd || null,
            durationSec: data.durationSec || null,
            verticalStyle: data.verticalStyle === 'fill' ? 'fill' : 'pillarbox',
            contentId: data.contentId ? new Types.ObjectId(data.contentId) : null,
            title: data.title,
            description: data.description || '',
            tags: data.tags || [],
            platforms: data.platforms,
            visibility: data.visibility || 'public',
            scheduledAt,
            status: isImmediate ? 'publishing' : 'scheduled',
            platformResults,
            thumbnailUrl: data.thumbnailUrl || '',
        });

        const saved = await job.save();

        // If immediate, execute now in background
        if (isImmediate) {
            this.executePublishJob(saved._id.toString()).catch((err) => {
                logger.error(`Failed to execute immediate publish job ${saved._id}: ${err.message}`);
            });
        }

        return saved;
    }

    /**
     * Execute a publish job — publish to all platforms
     */
    async executePublishJob(jobId: string): Promise<void> {
        const job = await PublishJob.findById(jobId);
        if (!job) {
            logger.error(`Publish job not found: ${jobId}`);
            return;
        }

        // Mark as publishing
        job.status = 'publishing';
        await job.save();

        let videoPath: string;
        let tempClipPath: string | null = null;

        if (job.uploadId) {
            // Legacy: use pre-uploaded file
            const upload = await Upload.findById(job.uploadId);
            if (!upload) {
                job.status = 'failed';
                await job.save();
                logger.error(`Upload not found for publish job: ${jobId}`);
                return;
            }
            videoPath = path.resolve(process.cwd(), 'uploads', upload.fileName);
        } else if (job.sourceUrl && job.timestampStart && job.timestampEnd) {
            // YouTube clip: download and cut to exact timestamps
            logger.info(`[PublishService] Downloading YouTube clip ${job.sourceUrl} [${job.timestampStart}→${job.timestampEnd}]`);
            // Mark every platform as 'downloading' up front — this phase happens
            // once and is shared by all of them, so the UI can show one honest
            // "downloading" label instead of a generic "Publishing…" the whole time.
            job.platformResults.forEach((pr) => { pr.stage = 'downloading'; });
            await job.save();
            try {
                const outDir = path.resolve(process.cwd(), 'uploads');
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                const needsVertical = job.platforms.some(p =>
                    p === 'youtube_shorts' || p === 'instagram_reels' || p === 'tiktok'
                );
                const cookiesFilePath = await resolveUserCookiesFile(job.userId?.toString());
                tempClipPath = await downloadAndCutYouTubeClip(
                    job.sourceUrl,
                    job.timestampStart,
                    job.timestampEnd,
                    outDir,
                    needsVertical,
                    job.verticalStyle || 'pillarbox',
                    (pct) => {
                        // Push download/conversion progress to all platform results
                        PublishJob.updateOne(
                            { _id: job._id },
                            { $set: { 'platformResults.$[].progress': pct } }
                        ).catch(() => {});
                    },
                    cookiesFilePath
                );
                videoPath = tempClipPath;
                logger.info(`[PublishService] Clip ready at ${videoPath}`);
                // Shared download/conversion is done — every platform is now
                // just waiting its turn in the sequential loop below.
                job.platformResults.forEach((pr) => { pr.stage = 'queued'; });
                await job.save();
            } catch (err: any) {
                job.status = 'failed';
                job.platformResults.forEach((pr) => { pr.status = 'failed'; pr.error = `Clip download failed: ${err.message}`; });
                await job.save();
                logger.error(`[PublishService] Clip download error: ${err.message}`);
                return;
            }
        } else {
            job.status = 'failed';
            await job.save();
            logger.error(`Publish job ${jobId} has neither uploadId nor sourceUrl+timestamps`);
            return;
        }
        let allSuccess = true;

        logger.info(`[PublishService] platformResults: ${JSON.stringify(job.platformResults.map(r => ({ platform: r.platform, status: r.status })))}`);

        for (let i = 0; i < job.platformResults.length; i++) {
            const pr = job.platformResults[i];
            logger.info(`[PublishService] Publishing to platform: "${pr.platform}"`);
            const adapter = getPlatformAdapter(pr.platform);

            if (!adapter) {
                pr.status = 'failed';
                pr.error = `No adapter available for platform: ${pr.platform}`;
                allSuccess = false;
                logger.error(`[PublishService] No adapter for "${pr.platform}"`);
                continue;
            }

            try {
                // Use atomic update for initial status so it doesn't conflict with progress saves
                await PublishJob.updateOne(
                    { _id: job._id, 'platformResults.platform': pr.platform },
                    { $set: { 'platformResults.$.status': 'publishing', 'platformResults.$.progress': 0, 'platformResults.$.stage': 'uploading' } }
                );

                const result = await adapter.publish(videoPath, {
                    title: job.title,
                    description: job.description,
                    tags: job.tags,
                    thumbnailUrl: job.thumbnailUrl,
                    visibility: job.visibility || 'public',
                }, job.userId.toString(), (progressPercentage: number) => {
                    // Fire-and-forget atomic update — no parallel save() conflict
                    PublishJob.updateOne(
                        { _id: job._id, 'platformResults.platform': pr.platform },
                        { $set: { 'platformResults.$.progress': progressPercentage } }
                    ).catch(() => {});
                });

                if (result.success) {
                    pr.status = 'published';
                    pr.liveUrl = result.liveUrl;
                    pr.publishedAt = new Date();
                } else {
                    pr.status = 'failed';
                    pr.error = result.error || 'Unknown error';
                    allSuccess = false;
                }
            } catch (error: any) {
                pr.status = 'failed';
                pr.error = error.message || 'Adapter threw an exception';
                allSuccess = false;
                logger.error(`[PublishService] Platform ${pr.platform} failed: ${error.message}`);
            }
        }

        // Single final save — no concurrent saves possible here
        job.status = allSuccess ? 'published' : 'failed';
        if (allSuccess) job.publishedAt = new Date();
        await job.save();

        // Clean up temp clip downloaded from YouTube
        if (tempClipPath) {
            fs.unlink(tempClipPath, () => {});
        }

        // Sync the linked Content record's status so Content Hub reflects the real state
        if (job.contentId) {
            const contentUpdate = allSuccess
                ? { status: 'PUBLISHED', publishedDate: new Date() }
                : { status: 'SCHEDULED' }; // leave as scheduled so user can retry
            await Content.findByIdAndUpdate(job.contentId, contentUpdate).catch((err: any) =>
                logger.warn(`[PublishService] Could not update content status: ${err.message}`)
            );
            logger.info(`[PublishService] Content ${job.contentId} status → ${contentUpdate.status}`);
        }

        logger.info(`[PublishService] Job ${jobId} completed with status: ${job.status}`);
    }

    /**
     * Get pending scheduled jobs that are ready to execute
     */
    async getPendingJobs(): Promise<IPublishJob[]> {
        return PublishJob.find({
            status: 'scheduled',
            scheduledAt: { $lte: new Date() },
        });
    }

    /**
     * List publish jobs for a user
     */
    async listPublishJobs(userId: string, query: { page?: number; limit?: number; status?: string; contentId?: string }) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const filter: any = { userId: new Types.ObjectId(userId) };
        if (query.status) {
            filter.status = query.status;
        }
        if (query.contentId) {
            filter.contentId = new Types.ObjectId(query.contentId);
        }

        const [data, total] = await Promise.all([
            PublishJob.find(filter)
                .populate('uploadId', 'originalName url size')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            PublishJob.countDocuments(filter),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get a single publish job by ID
     */
    async getPublishJobById(userId: string, jobId: string): Promise<IPublishJob> {
        const job = await PublishJob.findOne({
            _id: new Types.ObjectId(jobId),
            userId: new Types.ObjectId(userId),
        }).populate('uploadId', 'originalName url size');

        if (!job) {
            throw new NotFoundException('Publish job not found');
        }

        return job;
    }

    /**
     * Cancel a scheduled publish job
     */
    async cancelPublishJob(userId: string, jobId: string): Promise<IPublishJob> {
        const job = await PublishJob.findOne({
            _id: new Types.ObjectId(jobId),
            userId: new Types.ObjectId(userId),
        });

        if (!job) {
            throw new NotFoundException('Publish job not found');
        }

        if (job.status !== 'scheduled' && job.status !== 'draft') {
            throw new BadRequestException(`Cannot cancel job with status: ${job.status}`);
        }

        job.status = 'cancelled';
        return await job.save();
    }

    /**
     * Reset a failed/cancelled publish job back to scheduled so it runs on the next scheduler tick.
     */
    async retryPublishJob(userId: string, jobId: string): Promise<IPublishJob> {
        const job = await PublishJob.findOne({
            _id: new Types.ObjectId(jobId),
            userId: new Types.ObjectId(userId),
        });

        if (!job) {
            throw new NotFoundException('Publish job not found');
        }

        if (job.status !== 'failed' && job.status !== 'cancelled') {
            throw new BadRequestException(`Cannot retry job with status: ${job.status}`);
        }

        job.status = 'scheduled';
        job.scheduledAt = new Date(); // trigger immediately on next scheduler run
        // Mutate subdocuments in place — spreading Mongoose subdocs can drop fields
        job.platformResults.forEach(r => {
            r.status = 'pending';
            r.error = undefined;
            r.progress = 0;
        });
        return await job.save();
    }
}

export const publishService = new PublishService();
