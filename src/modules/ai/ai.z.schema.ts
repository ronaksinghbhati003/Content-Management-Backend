import { z } from 'zod';

const chatSchema = z.object({
    message: z.string().min(1, "Message is required and cannot be empty")
});

const generateSchema = z.object({
    prompt: z.string().min(3, "Prompt must be at least 3 characters"),
    autoSave: z.boolean().optional().default(false),
});

export { chatSchema, generateSchema };
