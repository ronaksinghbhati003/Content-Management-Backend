import { z } from 'zod';

export const createContentSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional(),
    tags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    hashtags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    platform: z.preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other']))),
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
});

export const updateContentSchema = createContentSchema.partial();

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
