import { z } from 'zod';

const baseContentSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional(),
    tags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    hashtags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    platform: z.preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other']))).optional(),
    status: z.enum(['IDEA', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
    contentType: z.enum(['video', 'short', 'reel', 'post', 'thread', 'article', 'other']).optional(),
    thumbnail: z.string().url().optional().or(z.literal('')),
    videoUrl: z.string().optional(),
    uploadId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid upload ID format')
        .optional()
        .nullable(),
    publishedDate: z.string().datetime().optional(),
    seriesId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid series ID format')
        .optional()
        .nullable(),
    number: z.number().optional().nullable(),
    duration: z.string().optional().nullable(),
    dueDate: z.preprocess((val) => (val === '' || val === null ? null : val), z.coerce.date().optional().nullable()),
});

const contentPreprocessor = (data: any) => {
    if (data && typeof data === 'object') {
        // Map type to contentType if contentType is missing
        if (!data.contentType && data.type) {
            data.contentType = data.type;
        }
        // Normalize status
        if (data.status && typeof data.status === 'string') {
            const upper = data.status.toUpperCase();
            if (upper === 'DRAFT') {
                data.status = 'IDEA';
            } else if (upper === 'SCRIPTED') {
                data.status = 'PLANNED';
            } else if (upper === 'FILMED') {
                data.status = 'IN_PROGRESS';
            } else if (upper === 'EDITED') {
                data.status = 'REVIEW';
            } else {
                data.status = upper;
            }
        }
        // Normalize platform: frontend sends platforms: ["YouTube", "YT Shorts"], but backend expects platform: ["youtube"]
        if (!data.platform && data.platforms) {
            data.platform = data.platforms.map((p: string) => {
                const lower = p.toLowerCase();
                if (lower === 'yt shorts' || lower === 'youtube shorts') return 'youtube';
                if (lower === 'instagram reels') return 'instagram';
                if (lower === 'twitter/x') return 'twitter';
                return lower;
            }).filter(Boolean);
        }
        if ((!data.platform || (Array.isArray(data.platform) && data.platform.length === 0)) && !data.platforms) {
            data.platform = ['youtube'];
        }
    }
    return data;
};

export const createContentSchema = z.preprocess(contentPreprocessor, baseContentSchema);
export const updateContentSchema = z.preprocess(contentPreprocessor, baseContentSchema.partial());

export const contentIdParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid content ID format'),
});

export const listContentQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
    status: z.enum(['IDEA', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
    platform: z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other']).optional(),
    seriesId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid series ID format')
        .optional(),
});

export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
