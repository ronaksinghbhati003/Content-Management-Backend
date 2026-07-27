import { z } from 'zod';

const chatSchema = z.object({
    message: z.string().min(1, "Message is required and cannot be empty")
});

const generateSchema = z.object({
    prompt: z.string().min(3, "Prompt must be at least 3 characters"),
    autoSave: z.boolean().optional().default(false),
});

const suggestSchema = z.object({
    type: z.enum(['title', 'description', 'script']),
    prompt: z.string().optional().default(''),
    description: z.string().optional(),
    wordCount: z.number().int().min(50).max(1000).optional(),
});

const thumbnailSchema = z.object({
    prompt: z.string().min(3, "Prompt must be at least 3 characters"),
    // Which platform the thumbnail is destined for — controls the generated
    // image's aspect ratio. Defaults to YouTube's 16:9 for backwards compatibility.
    size: z.enum(['youtube', 'instagram_square', 'instagram_reel']).optional().default('youtube'),
});

const rewriteSchema = z.object({
    text: z.string().min(1, "Text is required"),
    tone: z.string().optional(),
    instruction: z.string().optional(),
});

const highlightsSchema = z.object({
    text: z.string().min(1, "Text is required"),
});

const researchSchema = z.object({
    topic: z.string().min(3, "Topic must be at least 3 characters"),
});

export { chatSchema, generateSchema, suggestSchema, thumbnailSchema, rewriteSchema, highlightsSchema, researchSchema };
