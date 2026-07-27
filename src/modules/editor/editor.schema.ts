import mongoose, { Document, Schema } from 'mongoose';

export interface IEditorClip {
    uploadId: mongoose.Types.ObjectId;
    start: number;
    end: number;
    speed: number;
}

export interface IEditorWord {
    text: string;
    start: number;
    end: number;
}

export interface IEditorCaption {
    start: number;
    end: number;
    text: string;
    words: IEditorWord[];
    style: 'clean' | 'karaoke';
}

export interface IEditorProject extends Document {
    userId: mongoose.Types.ObjectId;
    sourceUploadId?: mongoose.Types.ObjectId;
    contentId?: mongoose.Types.ObjectId;
    edl: { clips: IEditorClip[] };
    captionTrack: IEditorCaption[];
    // Publish metadata — seeded from the AI-generated short (title/hook/hashtags)
    // when handed off from the Shorts Planner, editable here before publishing.
    title?: string;
    description?: string;
    hashtags?: string[];
    // 'downloading' covers the initial yt-dlp fetch + ffmpeg cut for the AI
    // hand-off path, before sourceUploadId exists — mirrors the publish
    // module's 'publishing' status pattern (fire-and-forget, poll to see it clear).
    renderStatus: 'downloading' | 'draft' | 'transcribing' | 'rendering' | 'ready' | 'failed';
    renderProgress?: number;
    renderError?: string | null;
    outputUploadId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const editorClipSchema = new Schema<IEditorClip>(
    {
        uploadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', required: true },
        start: { type: Number, required: true, min: 0 },
        end: { type: Number, required: true, min: 0 },
        speed: { type: Number, default: 1 },
    },
    { _id: false }
);

const editorWordSchema = new Schema<IEditorWord>(
    {
        text: { type: String, required: true },
        start: { type: Number, required: true },
        end: { type: Number, required: true },
    },
    { _id: false }
);

const editorCaptionSchema = new Schema<IEditorCaption>(
    {
        start: { type: Number, required: true },
        end: { type: Number, required: true },
        text: { type: String, required: true },
        words: { type: [editorWordSchema], default: [] },
        style: { type: String, enum: ['clean', 'karaoke'], default: 'clean' },
    },
    { _id: false }
);

const editorProjectSchema = new Schema<IEditorProject>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            required: true,
            index: true,
        },
        sourceUploadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Upload',
            default: null,
        },
        contentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Content',
            default: null,
        },
        edl: {
            clips: { type: [editorClipSchema], default: [] },
        },
        captionTrack: {
            type: [editorCaptionSchema],
            default: [],
        },
        title: {
            type: String,
            default: '',
        },
        description: {
            type: String,
            default: '',
        },
        hashtags: {
            type: [String],
            default: [],
        },
        renderStatus: {
            type: String,
            enum: ['downloading', 'draft', 'transcribing', 'rendering', 'ready', 'failed'],
            default: 'draft',
        },
        renderProgress: {
            type: Number,
            default: 0,
        },
        renderError: {
            type: String,
            default: null,
        },
        outputUploadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Upload',
            default: null,
        },
    },
    { timestamps: true }
);

editorProjectSchema.index({ userId: 1, createdAt: -1 });

const EditorProject = mongoose.model<IEditorProject>('EditorProject', editorProjectSchema);
export default EditorProject;
