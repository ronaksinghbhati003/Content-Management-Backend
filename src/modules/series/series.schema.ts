import mongoose, { Document, Schema } from 'mongoose';

export interface ISeries extends Document {
    title: string;
    description: string;
    tags: string[];
    platform: string[];
    status: string;
    thumbnail?: string;
    userId: mongoose.Types.ObjectId;
    isDeleted: boolean;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const seriesSchema = new Schema<ISeries>(
    {
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
        platform: {
            type: [String],
            required: true,
            enum: ['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other'],
            default: ['youtube'],
        },
        status: {
            type: String,
            required: true,
            enum: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
            default: 'DRAFT',
        },
        thumbnail: {
            type: String,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            required: true,
            index: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Compound indexes for common query patterns
seriesSchema.index({ userId: 1, status: 1, isDeleted: 1 });
seriesSchema.index({ userId: 1, platform: 1, isDeleted: 1 });

const Series = mongoose.model<ISeries>('Series', seriesSchema);
export default Series;
