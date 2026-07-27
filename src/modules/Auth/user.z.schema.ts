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

const updateProfileSchema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,30}$/, "Username must be 3-30 characters: letters, numbers, underscore, or dot").optional(),
    bio: z.string().max(160).optional(),
    niche: z.string().max(50).optional(),
    location: z.string().max(100).optional(),
    website: z.string().max(200).optional(),
    avatar: z.string().max(2000).optional(),
    bannerIndex: z.number().int().min(0).max(5).optional(),
    socialLinks: z.object({
        youtube: z.string().max(200).optional(),
        instagram: z.string().max(200).optional(),
        tiktok: z.string().max(200).optional(),
        twitter: z.string().max(200).optional(),
    }).optional(),
})

export { registerSchema, loginSchema, updateProfileSchema }