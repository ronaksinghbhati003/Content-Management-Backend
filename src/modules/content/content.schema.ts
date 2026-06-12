import mongoose, { Document, Schema } from 'mongoose';

export interface IContent extends Document {
    title: string;
    description: string;
    tags: string[];
    hashtags: string[];
    platform: string[];
    status: string;
    contentType: string;
    thumbnail?: string;
    videoUrl?: string;
    uploadId?: mongoose.Types.ObjectId;
    publishedDate?: Date;
    userId: mongoose.Types.ObjectId;
    seriesId: mongoose.Types.ObjectId;
    number?: number;
    duration?: string;
    dueDate?: Date;
    isDeleted: boolean;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const contentSchema = new Schema<IContent>(
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
        hashtags: {
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
            enum: ['IDEA', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
            default: 'IDEA',
        },
        contentType: {
            type: String,
            enum: ['video', 'short', 'reel', 'post', 'thread', 'article', 'other'],
            default: 'video',
        },
        thumbnail: {
            type: String,
        },
        videoUrl: {
            type: String,
            default: '',
        },
        uploadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Upload',
            default: null,
        },
        publishedDate: {
            type: Date,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            required: true,
            index: true,
        },
        seriesId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Series',
            default: null,
            index: true
        },
        number: {
            type: Number,
        },
        duration: {
            type: String,
        },
        dueDate: {
            type: Date,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true
        },
        deletedAt: {
            type: Date,
            default: null
        }
    },
    { 
        timestamps: true,
        toJSON: { 
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id ? ret._id.toString() : ret.id;
                ret.type = ret.contentType;
                if (ret.seriesId) {
                    const statusMap: Record<string, string> = {
                        'IDEA': 'Draft',
                        'PLANNED': 'Scripted',
                        'IN_PROGRESS': 'Filmed',
                        'REVIEW': 'Edited',
                        'SCHEDULED': 'Edited',
                        'PUBLISHED': 'Published',
                        'ARCHIVED': 'Draft'
                    };
                    ret.status = statusMap[ret.status] || 'Draft';
                } else {
                    const statusMap: Record<string, string> = {
                        'IDEA': 'draft',
                        'PLANNED': 'draft',
                        'IN_PROGRESS': 'draft',
                        'REVIEW': 'draft',
                        'SCHEDULED': 'scheduled',
                        'PUBLISHED': 'published',
                        'ARCHIVED': 'draft'
                    };
                    ret.status = statusMap[ret.status] || 'draft';
                }
                return ret;
            }
        },
        toObject: { 
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id ? ret._id.toString() : ret.id;
                ret.type = ret.contentType;
                if (ret.seriesId) {
                    const statusMap: Record<string, string> = {
                        'IDEA': 'Draft',
                        'PLANNED': 'Scripted',
                        'IN_PROGRESS': 'Filmed',
                        'REVIEW': 'Edited',
                        'SCHEDULED': 'Edited',
                        'PUBLISHED': 'Published',
                        'ARCHIVED': 'Draft'
                    };
                    ret.status = statusMap[ret.status] || 'Draft';
                } else {
                    const statusMap: Record<string, string> = {
                        'IDEA': 'draft',
                        'PLANNED': 'draft',
                        'IN_PROGRESS': 'draft',
                        'REVIEW': 'draft',
                        'SCHEDULED': 'scheduled',
                        'PUBLISHED': 'published',
                        'ARCHIVED': 'draft'
                    };
                    ret.status = statusMap[ret.status] || 'draft';
                }
                return ret;
            }
        }
    }
);

// Virtual for 'type' fallback
contentSchema.virtual('type').get(function(this: any) {
    return this.contentType;
});

// Add index for common queries
contentSchema.index({ userId: 1, status: 1, isDeleted: 1 });
contentSchema.index({ userId: 1, platform: 1, isDeleted: 1 });

const Content = mongoose.model<IContent>('Content', contentSchema);
export default Content;
