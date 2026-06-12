import { z } from 'zod';

export const createSeriesSchema = z.object({
    title: z.string().max(255).optional(),
    name: z.string().min(1, 'Name is required').max(255).optional(),
    description: z.string().optional(),
    tags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    hashtags: z.preprocess((val) => (typeof val === 'string' ? val.split(',').map(s => s.trim()) : val), z.array(z.string())).optional(),
    platform: z.preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.enum(['youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'other']))).optional(),
    platforms: z.array(z.string()).optional(),
    status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
    contentType: z.enum(['video', 'short', 'reel', 'post', 'thread', 'article', 'other']).optional(),
    thumbnail: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
    publishedDate: z.coerce.date().optional(),
    seriesId: z.string().optional(),
    type: z.string().optional(),
    episodes: z.number().optional(),
    completed: z.number().optional(),
    archived: z.boolean().optional(),
    lastUpdated: z.string().optional(),
    estCompletion: z.string().optional(),
    theme: z.string().optional(),
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
