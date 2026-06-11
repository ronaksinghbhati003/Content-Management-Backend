import { z } from 'zod';

export const createSeriesSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional(),
    tags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    hashtags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    platform: z.preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other']))),
    status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
    contentType: z.enum(['video', 'short', 'reel', 'post', 'thread', 'article', 'other']).optional(),
    thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
    publishedDate: z.coerce.date().optional(),
    seriesId: z.string().optional(),
});

export const updateSeriesSchema = createSeriesSchema.partial();

export const seriesIdParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid series ID format'),
});

export const listSeriesQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
    status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
    platform: z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other']).optional(),
});

/** Schema used to assign a seriesId when getting contents of a specific series */
export const seriesContentsQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
});

export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;
