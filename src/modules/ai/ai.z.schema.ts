import { z } from 'zod';

const chatSchema = z.object({
    message: z.string().min(1, "Message is required and cannot be empty")
});

export { chatSchema };
