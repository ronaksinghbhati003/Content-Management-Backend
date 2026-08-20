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

const updatePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
})

const updateNotificationsSchema = z.object({
    weeklyReport: z.boolean().optional(),
    subscriberMilestone: z.boolean().optional(),
    schedulerReminders: z.boolean().optional(),
    aiInsightAlerts: z.boolean().optional(),
    episodeDueReminders: z.boolean().optional(),
    roadmapDeadlineAlerts: z.boolean().optional(),
    teamMentions: z.boolean().optional(),
})

const deleteAccountSchema = z.object({
    password: z.string().min(1, "Password is required to delete your account"),
})

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a 6-digit hex color, e.g. #6366F1");

const updateThemeSchema = z.object({
    id: z.string().min(1).max(30).optional(),
    mode: z.enum(['light', 'dark']).optional(),
    colors: z.object({
        text: hexColor,
        component: hexColor,
        page: hexColor,
    }).optional(),
})

export { registerSchema, loginSchema, updateProfileSchema, updatePasswordSchema, updateNotificationsSchema, deleteAccountSchema, updateThemeSchema }