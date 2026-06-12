import { Types } from 'mongoose';
import PublishJob, { IPublishJob, IPlatformResult } from './publish.schema';
import Upload from '../upload/upload.schema';
import { NotFoundException, BadRequestException } from '../../shared/http-exception';
import { getPlatformAdapter } from './platforms';
import logger from '../../config/logger';
import path from 'path';

export interface CreatePublishJobInput {
    uploadId: string;
    title: string;
    description?: string;
    tags?: string[];
    platforms: string[];
    scheduledAt: string; // ISO date string
    thumbnailUrl?: string;
    contentId?: string;
}

export class PublishService {
    /**
     * Create a new publish job
     */
    async createPublishJob(userId: string, data: CreatePublishJobInput): Promise<IPublishJob> {
        // Verify the upload exists and belongs to the user
        const upload = await Upload.findOne({
            _id: new Types.ObjectId(data.uploadId),
            userId: new Types.ObjectId(userId),
        });

        if (!upload) {
            throw new NotFoundException('Upload not found. Please upload a video first.');
        }

        const scheduledAt = new Date(data.scheduledAt);
        const isImmediate = scheduledAt <= new Date();

        // Build per-platform result entries
        const platformResults: IPlatformResult[] = data.platforms.map((platform) => ({
            platform,
            status: 'pending' as const,
        }));

        const job = new PublishJob({
            userId: new Types.ObjectId(userId),
            uploadId: new Types.ObjectId(data.uploadId),
            contentId: data.contentId ? new Types.ObjectId(data.contentId) : null,
            title: data.title,
            description: data.description || '',
            tags: data.tags || [],
            platforms: data.platforms,
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

        const upload = await Upload.findById(job.uploadId);
        if (!upload) {
            job.status = 'failed';
            await job.save();
            logger.error(`Upload not found for publish job: ${jobId}`);
            return;
        }

        // Mark as publishing
        job.status = 'publishing';
        await job.save();

        const videoPath = path.resolve(process.cwd(), 'uploads', upload.fileName);
        let allSuccess = true;

        for (let i = 0; i < job.platformResults.length; i++) {
            const pr = job.platformResults[i];
            const adapter = getPlatformAdapter(pr.platform);

            if (!adapter) {
                pr.status = 'failed';
                pr.error = `No adapter available for platform: ${pr.platform}`;
                allSuccess = false;
                continue;
            }

            try {
                pr.status = 'publishing';
                await job.save();

                const result = await adapter.publish(videoPath, {
                    title: job.title,
                    description: job.description,
                    tags: job.tags,
                    thumbnailUrl: job.thumbnailUrl,
                }, job.userId.toString());

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

        job.status = allSuccess ? 'published' : 'failed';
        if (allSuccess) {
            job.publishedAt = new Date();
        }
        await job.save();

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
}

export const publishService = new PublishService();
