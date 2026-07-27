import { z } from 'zod';

const objectId = (message: string) => z.string().regex(/^[0-9a-fA-F]{24}$/, message);

export const createEditorProjectSchema = z.object({
    sourceUploadId: objectId('Invalid upload ID format').optional(),
    contentId: objectId('Invalid content ID format').optional(),
    // AI hand-off path: materialize a YouTube section as local footage first.
    sourceUrl: z.string().url().optional(),
    timestampStart: z.string().optional(),
    timestampEnd: z.string().optional(),
    // 'pillarbox' (default): full frame, blurred letterbox filler. 'fill': cropped edge-to-edge, no bars.
    verticalStyle: z.enum(['pillarbox', 'fill']).optional(),
    // Seeds publish metadata from the AI-generated short, if handed off from the Shorts Planner.
    title: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    hashtags: z.array(z.string()).optional(),
}).refine(
    (data) => !!data.sourceUploadId || !!(data.sourceUrl && data.timestampStart && data.timestampEnd),
    { message: 'Either sourceUploadId, or sourceUrl with timestampStart and timestampEnd, is required.' }
);

const editorClipSchema = z.object({
    uploadId: objectId('Invalid upload ID format'),
    start: z.number().min(0),
    end: z.number().min(0),
    speed: z.number().min(0.5).max(2).default(1),
});

export const updateEdlSchema = z.object({
    clips: z.array(editorClipSchema).min(1, 'A project needs at least one clip'),
});

const editorWordSchema = z.object({
    text: z.string(),
    start: z.number().min(0),
    end: z.number().min(0),
});

const editorCaptionSchema = z.object({
    start: z.number().min(0),
    end: z.number().min(0),
    text: z.string(),
    words: z.array(editorWordSchema).default([]),
    style: z.enum(['clean', 'karaoke']).default('clean'),
});

export const updateCaptionsSchema = z.object({
    captionTrack: z.array(editorCaptionSchema),
});

export const updateDetailsSchema = z.object({
    title: z.string().max(100).optional(),
    description: z.string().max(2000).optional(),
    hashtags: z.array(z.string()).optional(),
});

export const editorProjectIdParamsSchema = z.object({
    id: objectId('Invalid editor project ID format'),
});

export type CreateEditorProjectInput = z.infer<typeof createEditorProjectSchema>;
export type UpdateEdlInput = z.infer<typeof updateEdlSchema>;
export type UpdateCaptionsInput = z.infer<typeof updateCaptionsSchema>;
export type UpdateDetailsInput = z.infer<typeof updateDetailsSchema>;
