import User from "./user.schema";
import { generateToken } from "../../utils/jwt";
import logger from "../../config/logger";
import { comparePassword } from "../../utils/hash.pass";
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
    };
}

export class UserService {
    async login({ email, password }: { email: string, password: string }): Promise<LoginData> {
        const user = await User.findOne({ email });
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
}