import mongoose, { Document, Schema } from 'mongoose';

export interface IChecklistItem {
    id: string | number;
    text: string;
    done: boolean;
}

export interface IActivityEntry {
    id: string | number;
    text: string;
    // Free-text relative timestamp (e.g. "2 days ago", "Just now") — the
    // board writes these client-side at the moment of the action, matching
    // how the frontend already generates them; not a real Date.
    date: string;
}

export interface IRoadmapItem extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    status: 'Brainstorming' | 'Scripting' | 'Production' | 'Post-Production';
    tags: string[];
    // Free-text due label (e.g. "Apr 25", "TBD") rather than a real Date —
    // the board lets creators type anything here, not just calendar dates.
    due: string;
    priority: 'Low' | 'Medium' | 'High' | 'Urgent';
    progress: number;
    checklist: IChecklistItem[];
    notes: string;
    platforms: string[];
    activity: IActivityEntry[];
    createdAt: Date;
    updatedAt: Date;
}

const checklistItemSchema = new Schema<IChecklistItem>(
    {
        id: { type: Schema.Types.Mixed, required: true },
        text: { type: String, default: '' },
        done: { type: Boolean, default: false },
    },
    { _id: false }
);

const activityEntrySchema = new Schema<IActivityEntry>(
    {
        id: { type: Schema.Types.Mixed, required: true },
        text: { type: String, default: '' },
        date: { type: String, default: '' },
    },
    { _id: false }
);

const roadmapItemSchema = new Schema<IRoadmapItem>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['Brainstorming', 'Scripting', 'Production', 'Post-Production'],
            default: 'Brainstorming',
        },
        tags: {
            type: [String],
            default: [],
        },
        due: {
            type: String,
            default: 'TBD',
        },
        priority: {
            type: String,
            enum: ['Low', 'Medium', 'High', 'Urgent'],
            default: 'Medium',
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        checklist: {
            type: [checklistItemSchema],
            default: [],
        },
        notes: {
            type: String,
            default: '',
        },
        platforms: {
            type: [String],
            default: [],
        },
        activity: {
            type: [activityEntrySchema],
            default: [],
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id ? ret._id.toString() : ret.id;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
            transform: (doc, ret: any) => {
                ret.id = ret._id ? ret._id.toString() : ret.id;
                return ret;
            },
        },
    }
);

roadmapItemSchema.index({ userId: 1, status: 1 });

const RoadmapItem = mongoose.model<IRoadmapItem>('RoadmapItem', roadmapItemSchema);
export default RoadmapItem;
