import mongoose, { Document, Schema } from 'mongoose';

export interface IUpload extends Document {
    userId: mongoose.Types.ObjectId;
    originalName: string;
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
    duration?: number;
    status: 'processing' | 'ready' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

const uploadSchema = new Schema<IUpload>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            required: true,
            index: true,
        },
        originalName: {
            type: String,
            required: true,
            trim: true,
        },
        fileName: {
            type: String,
            required: true,
            unique: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            required: true,
        },
        url: {
            type: String,
            required: true,
        },
        duration: {
            type: Number,
            default: null,
        },
        status: {
            type: String,
            enum: ['processing', 'ready', 'failed'],
            default: 'ready',
        },
    },
    { 
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

uploadSchema.index({ userId: 1, createdAt: -1 });

const Upload = mongoose.model<IUpload>('Upload', uploadSchema);
export default Upload;
