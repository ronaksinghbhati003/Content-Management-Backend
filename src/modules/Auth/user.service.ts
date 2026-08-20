import User from "./user.schema";
import { generateToken } from "../../utils/jwt";
import logger from "../../config/logger";
import { comparePassword, hashPassword } from "../../utils/hash.pass";
import { UnauthorizedException, NotFoundException, ConflictException } from "../../shared/http-exception";

export default interface RegisterData {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash?: string;
}

export interface UserInterFace {
    firstName: string;
    lastName: string;
    email: string;
    _id: string;
    createdAt: Date;
    updatedAt: Date;
    youtubeConnected?: boolean;
    youtubeChannelName?: string;
    youtubeChannelHandle?: string;
    youtubeChannelIcon?: string;
    youtubeSubscriberCount?: number;
    username?: string;
    bio?: string;
    niche?: string;
    location?: string;
    website?: string;
    avatar?: string;
    bannerIndex?: number;
    socialLinks?: {
        youtube?: string;
        instagram?: string;
        tiktok?: string;
        twitter?: string;
    };
    notificationPreferences?: NotificationPreferences;
    themePreference?: ThemePreference;
}

export interface ThemePreference {
    id?: string;
    mode?: 'light' | 'dark';
    colors?: {
        text?: string;
        component?: string;
        page?: string;
    };
}

export interface NotificationPreferences {
    weeklyReport?: boolean;
    subscriberMilestone?: boolean;
    schedulerReminders?: boolean;
    aiInsightAlerts?: boolean;
    episodeDueReminders?: boolean;
    roadmapDeadlineAlerts?: boolean;
    teamMentions?: boolean;
}

export interface UpdateProfileData {
    firstName?: string;
    lastName?: string;
    username?: string;
    bio?: string;
    niche?: string;
    location?: string;
    website?: string;
    avatar?: string;
    bannerIndex?: number;
    socialLinks?: {
        youtube?: string;
        instagram?: string;
        tiktok?: string;
        twitter?: string;
    };
}

interface LoginData {
    user: UserInterFace,
    token: string;
}

// Single place mapping a Mongoose user doc -> the public-facing UserInterFace
// shape, so login/register/getProfile/updateProfile can't drift from each other.
function toUserInterface(user: any): UserInterFace {
    return {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        _id: user._id.toString(),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        youtubeConnected: user.youtubeConnected,
        youtubeChannelName: user.youtubeChannelName ?? undefined,
        youtubeChannelHandle: user.youtubeChannelHandle ?? undefined,
        youtubeChannelIcon: user.youtubeChannelIcon ?? undefined,
        youtubeSubscriberCount: user.youtubeSubscriberCount ?? undefined,
        username: user.username ?? undefined,
        bio: user.bio ?? '',
        niche: user.niche ?? '',
        location: user.location ?? '',
        website: user.website ?? '',
        avatar: user.avatar ?? '',
        bannerIndex: user.bannerIndex ?? 0,
        socialLinks: {
            youtube: user.socialLinks?.youtube ?? '',
            instagram: user.socialLinks?.instagram ?? '',
            tiktok: user.socialLinks?.tiktok ?? '',
            twitter: user.socialLinks?.twitter ?? '',
        },
        notificationPreferences: {
            weeklyReport: user.notificationPreferences?.weeklyReport ?? true,
            subscriberMilestone: user.notificationPreferences?.subscriberMilestone ?? true,
            schedulerReminders: user.notificationPreferences?.schedulerReminders ?? true,
            aiInsightAlerts: user.notificationPreferences?.aiInsightAlerts ?? true,
            episodeDueReminders: user.notificationPreferences?.episodeDueReminders ?? true,
            roadmapDeadlineAlerts: user.notificationPreferences?.roadmapDeadlineAlerts ?? true,
            teamMentions: user.notificationPreferences?.teamMentions ?? false,
        },
        themePreference: {
            id: user.themePreference?.id ?? 'indigo',
            mode: user.themePreference?.mode ?? 'light',
            colors: {
                text: user.themePreference?.colors?.text ?? '#312E81',
                component: user.themePreference?.colors?.component ?? '#6366F1',
                page: user.themePreference?.colors?.page ?? '#EEF2FF',
            },
        },
    };
}

export class UserService {
    async login({ email, password }: { email: string, password: string }): Promise<LoginData> {
        const user = await User.findOne({ email, isDeleted: { $ne: true } });
        if (!user) {
            throw new UnauthorizedException("Invalid email or password");
        }

        const isPasswordValid = await comparePassword(password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedException("Invalid email or password");
        }


        logger.info(`User Found ${user.email}`);
        // Only the id goes into the token — every consumer of req.users only
        // ever reads req.users._id (confirmed across the codebase), so there's
        // no reason to embed the full user document (passwordHash, YouTube/
        // Instagram OAuth tokens, cookies text, etc.) into a JWT that then gets
        // sent as a header on every single request and logged.
        const token = generateToken({ _id: user._id.toString() });
        return {
            user: toUserInterface(user),
            token
        }
    }

    async register(payload: RegisterData): Promise<UserInterFace> {
        const user = await User.create(payload);
        return toUserInterface(user);
    }

    async getProfile(userId: string): Promise<UserInterFace> {
        const user = await User.findById(userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }
        return toUserInterface(user);
    }

    async updateProfile(userId: string, updates: UpdateProfileData): Promise<UserInterFace> {
        if (updates.username) {
            const existing = await User.findOne({ username: updates.username, _id: { $ne: userId } });
            if (existing) {
                throw new ConflictException("That username is already taken");
            }
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!user) {
            throw new NotFoundException("User not found");
        }
        return toUserInterface(user);
    }

    async updateNotificationPreferences(userId: string, prefs: NotificationPreferences): Promise<UserInterFace> {
        const $set: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(prefs)) {
            if (value !== undefined) $set[`notificationPreferences.${key}`] = value;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set },
            { new: true, runValidators: true }
        );
        if (!user) {
            throw new NotFoundException("User not found");
        }
        return toUserInterface(user);
    }

    async updateThemePreference(userId: string, theme: ThemePreference): Promise<UserInterFace> {
        const $set: Record<string, string> = {};
        if (theme.id !== undefined) $set['themePreference.id'] = theme.id;
        if (theme.mode !== undefined) $set['themePreference.mode'] = theme.mode;
        if (theme.colors?.text !== undefined) $set['themePreference.colors.text'] = theme.colors.text;
        if (theme.colors?.component !== undefined) $set['themePreference.colors.component'] = theme.colors.component;
        if (theme.colors?.page !== undefined) $set['themePreference.colors.page'] = theme.colors.page;

        const user = await User.findByIdAndUpdate(
            userId,
            { $set },
            { new: true, runValidators: true }
        );
        if (!user) {
            throw new NotFoundException("User not found");
        }
        return toUserInterface(user);
    }

    async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await User.findById(userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }

        const isValid = await comparePassword(currentPassword, user.passwordHash);
        if (!isValid) {
            throw new UnauthorizedException("Current password is incorrect");
        }

        user.passwordHash = await hashPassword(newPassword);
        await user.save();
        logger.info(`Password updated for user ${userId}`);
    }

    async deleteAccount(userId: string, password: string): Promise<void> {
        const user = await User.findById(userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }

        const isValid = await comparePassword(password, user.passwordHash);
        if (!isValid) {
            throw new UnauthorizedException("Password is incorrect");
        }

        user.isDeleted = true;
        user.deletedAt = new Date();
        await user.save();
        logger.info(`Account soft-deleted for user ${userId}`);
    }
}