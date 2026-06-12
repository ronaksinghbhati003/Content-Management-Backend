import mongoose, { Document, Schema } from 'mongoose';

export interface ISeries extends Document {
    title?: string;
    name?: string;
    description?: string;
    tags?: string[];
    platform?: string[];
    platforms?: string[];
    type?: string;
    episodes?: number;
    completed?: number;
    archived?: boolean;
    lastUpdated?: string;
    estCompletion?: string;
    theme?: string;
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
            trim: true,
        },
        name: {
            type: String,
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
            enum: ['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other'],
            default: ['youtube'],
        },
        platforms: {
            type: [String],
            default: [],
        },
        type: {
            type: String,
            default: 'Course',
        },
        episodes: {
            type: Number,
            default: 0,
        },
        completed: {
            type: Number,
            default: 0,
        },
        archived: {
            type: Boolean,
            default: false,
        },
        lastUpdated: {
            type: String,
        },
        estCompletion: {
            type: String,
        },
        theme: {
            type: String,
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
    { 
        timestamps: true,
        toJSON: { 
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id ? ret._id.toString() : ret.id;
                if (!ret.name) ret.name = ret.title;
                if (!ret.title) ret.title = ret.name;
                if (!ret.platforms || ret.platforms.length === 0) {
                    ret.platforms = ret.platform ? ret.platform.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)) : [];
                }
                if (!ret.platform || ret.platform.length === 0) {
                    ret.platform = ret.platforms ? ret.platforms.map((p: string) => p.toLowerCase()) : [];
                }
                if (ret.archived === undefined) {
                    ret.archived = ret.status === 'ARCHIVED';
                }
                return ret;
            }
        },
        toObject: { 
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id ? ret._id.toString() : ret.id;
                if (!ret.name) ret.name = ret.title;
                if (!ret.title) ret.title = ret.name;
                if (!ret.platforms || ret.platforms.length === 0) {
                    ret.platforms = ret.platform ? ret.platform.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)) : [];
                }
                if (!ret.platform || ret.platform.length === 0) {
                    ret.platform = ret.platforms ? ret.platforms.map((p: string) => p.toLowerCase()) : [];
                }
                if (ret.archived === undefined) {
                    ret.archived = ret.status === 'ARCHIVED';
                }
                return ret;
            }
        }
    }
);

// Pre-save hook to keep fields synchronized
seriesSchema.pre('save', function (this: any) {
    if (this.name && !this.title) {
        this.title = this.name;
    }
    if (this.title && !this.name) {
        this.name = this.title;
    }
    if (this.platforms && this.platforms.length > 0 && (!this.platform || this.platform.length === 0)) {
        this.platform = this.platforms.map((p: string) => p.toLowerCase());
    }
    if (this.platform && this.platform.length > 0 && (!this.platforms || this.platforms.length === 0)) {
        this.platforms = this.platform.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1));
    }
    if (this.archived) {
        this.status = 'ARCHIVED';
    } else if (this.status === 'ARCHIVED') {
        this.archived = true;
    }
});

// Pre-findOneAndUpdate hook to keep fields synchronized during update
seriesSchema.pre('findOneAndUpdate', function (this: any) {
    const update = this.getUpdate() as any;
    if (update) {
        const set = update.$set || update;
        if (set.name && !set.title) {
            set.title = set.name;
        }
        if (set.title && !set.name) {
            set.name = set.title;
        }
        if (set.platforms && set.platforms.length > 0) {
            set.platform = set.platforms.map((p: string) => p.toLowerCase());
        }
        if (set.platform && set.platform.length > 0) {
            set.platforms = set.platform.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1));
        }
        if (set.archived !== undefined) {
            if (set.archived) {
                set.status = 'ARCHIVED';
            } else if (set.status === 'ARCHIVED') {
                set.archived = true;
            } else {
                set.status = 'ACTIVE';
            }
        }
    }
});

// Compound indexes for common query patterns
seriesSchema.index({ userId: 1, status: 1, isDeleted: 1 });
seriesSchema.index({ userId: 1, platform: 1, isDeleted: 1 });

const Series = mongoose.model<ISeries>('Series', seriesSchema);
export default Series;
