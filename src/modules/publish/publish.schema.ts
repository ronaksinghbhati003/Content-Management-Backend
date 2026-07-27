import mongoose, { Document, Schema } from 'mongoose';

export interface IPlatformResult {
    platform: string;
    status: 'pending' | 'publishing' | 'published' | 'failed';
    liveUrl?: string;
    error?: string;
    publishedAt?: Date;
    progress?: number;
    // 'downloading' while the source clip is being fetched/cut/vertical-converted
    // (shared across every platform in the job, since it only happens once);
    // 'queued' once that's done but a platform ahead of this one in the
    // (sequential) upload loop hasn't finished yet; 'uploading' once this
    // platform's own adapter upload actually begins. Lets the UI show an
    // accurate label instead of a generic "Publishing…" for what's really
    // three very different-length phases.
    stage?: 'downloading' | 'queued' | 'uploading';
}

export interface IPublishJob extends Document {
    userId: mongoose.Types.ObjectId;
    uploadId?: mongoose.Types.ObjectId;
    // YouTube clip source (used when no uploadId)
    sourceUrl?: string;
    youtubeVideoId?: string;
    timestampStart?: string;
    timestampEnd?: string;
    durationSec?: number;
    // How the 16:9 source is cropped to 9:16 when downloaded fresh from
    // sourceUrl — irrelevant for uploadId jobs, where the file is already
    // whatever shape it was rendered as.
    verticalStyle?: 'pillarbox' | 'fill';
    title: string;
    description: string;
    tags: string[];
    platforms: string[];
    visibility: 'public' | 'unlisted' | 'private';
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
        progress: { type: Number, default: 0 },
        stage: {
            type: String,
            enum: ['downloading', 'queued', 'uploading'],
            default: 'uploading',
        },
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
            required: false,
            default: null,
        },
        sourceUrl: { type: String, default: null },
        youtubeVideoId: { type: String, default: null },
        timestampStart: { type: String, default: null },
        timestampEnd: { type: String, default: null },
        durationSec: { type: Number, default: null },
        verticalStyle: {
            type: String,
            enum: ['pillarbox', 'fill'],
            default: 'pillarbox',
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
        visibility: {
            type: String,
            enum: ['public', 'unlisted', 'private'],
            default: 'public',
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
    { 
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

publishJobSchema.index({ status: 1, scheduledAt: 1 });
publishJobSchema.index({ userId: 1, createdAt: -1 });

const PublishJob = mongoose.model<IPublishJob>('PublishJob', publishJobSchema);
export default PublishJob;
