import { z } from 'zod';

export const softDeleteSchema = z.object({
    collectionName: z.string().min(1, 'Collection name is required'),
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format'),
});

export type SoftDeleteInput = z.infer<typeof softDeleteSchema>;
