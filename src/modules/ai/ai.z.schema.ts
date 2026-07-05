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

export { chatSchema, generateSchema, suggestSchema };
