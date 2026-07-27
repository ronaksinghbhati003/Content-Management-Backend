import { z } from 'zod';

const checklistItemSchema = z.object({
    id: z.union([z.string(), z.number()]),
    text: z.string().default(''),
    done: z.boolean().default(false),
});

const activityEntrySchema = z.object({
    id: z.union([z.string(), z.number()]),
    text: z.string().default(''),
    date: z.string().default(''),
});

const baseRoadmapSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    status: z.enum(['Brainstorming', 'Scripting', 'Production', 'Post-Production']).optional(),
    tags: z.array(z.string()).optional(),
    due: z.string().optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    progress: z.number().min(0).max(100).optional(),
    checklist: z.array(checklistItemSchema).optional(),
    notes: z.string().optional(),
    platforms: z.array(z.string()).optional(),
    activity: z.array(activityEntrySchema).optional(),
});

// The board sends its optimistic client-side temp id ("temp-<timestamp>")
// along with create payloads — strip it rather than reject the request,
// since the real id comes back from Mongo on creation.
const stripClientId = (data: any) => {
    if (data && typeof data === 'object') {
        const { id, ...rest } = data;
        return rest;
    }
    return data;
};

export const createRoadmapItemSchema = z.preprocess(stripClientId, baseRoadmapSchema);
export const updateRoadmapItemSchema = z.preprocess(stripClientId, baseRoadmapSchema.partial());

export const roadmapIdParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid roadmap item ID format'),
});

export const listRoadmapQuerySchema = z.object({
    status: z.enum(['Brainstorming', 'Scripting', 'Production', 'Post-Production']).optional(),
});

export type CreateRoadmapItemInput = z.infer<typeof baseRoadmapSchema>;
export type UpdateRoadmapItemInput = Partial<CreateRoadmapItemInput>;
