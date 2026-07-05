import { z } from 'zod';

const registerSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    password: z.string()
})

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string()
})

export { registerSchema, loginSchema }