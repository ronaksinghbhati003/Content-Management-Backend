import mongoose, { Document, Schema } from 'mongoose';

export interface IPlatformResult {
    platform: string;
    status: 'pending' | 'publishing' | 'published' | 'failed';
    liveUrl?: string;
    error?: string;
    publishedAt?: Date;
}

export interface IPublishJob extends Document {
    userId: mongoose.Types.ObjectId;
    uploadId: mongoose.Types.ObjectId;
    title: string;
    description: string;
    tags: string[];
    platforms: string[];
    scheduledAt: Date;
    status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
    platformResults: IPlatformResult[];
    thumbnailUrl?: string;
    contentId?: mongoose.Types.ObjectId;
    publishedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const platformResultSchema = new Schema<IPlatformResult>(
    {
        platform: { type: String, required: true },
        status: {
            type: String,
            enum: ['pending', 'publishing', 'published', 'failed'],
            default: 'pending',
        },
        liveUrl: { type: String, default: null },
        error: { type: String, default: null },
        publishedAt: { type: Date, default: null },
    },
    { _id: false }
);

const publishJobSchema = new Schema<IPublishJob>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            required: true,
            index: true,
        },
        uploadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Upload',
            required: true,
        },
        contentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Content',
            default: null,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        tags: {
            type: [String],
            default: [],
        },
        platforms: {
            type: [String],
            required: true,
            enum: ['youtube', 'youtube_shorts', 'instagram_reels', 'tiktok'],
        },
        scheduledAt: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'],
            default: 'scheduled',
        },
        platformResults: {
            type: [platformResultSchema],
            default: [],
        },
        thumbnailUrl: {
            type: String,
            default: '',
        },
        publishedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

publishJobSchema.index({ status: 1, scheduledAt: 1 });
publishJobSchema.index({ userId: 1, createdAt: -1 });

const PublishJob = mongoose.model<IPublishJob>('PublishJob', publishJobSchema);
export default PublishJob;
