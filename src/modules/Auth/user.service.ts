import User from "./user.schema";
import { generateToken } from "../../utils/jwt";
import logger from "../../config/logger";
import { comparePassword } from "../../utils/hash.pass";
import { UnauthorizedException } from "../../shared/http-exception";

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
}

interface LoginData {
    user: UserInterFace,
    token: string;
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


        logger.info(`User Found ${user}`);
        const token = generateToken(user.toObject());
        return {
            user: {
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
                youtubeSubscriberCount: user.youtubeSubscriberCount ?? undefined
            },
            token
        }
    }

    async register(payload: RegisterData): Promise<UserInterFace> {
        const user = await User.create(payload);
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
            youtubeSubscriberCount: user.youtubeSubscriberCount ?? undefined
        }
    }

    async getProfile(userId: string): Promise<UserInterFace> {
        const user = await User.findById(userId);
        if (!user) {
            throw new UnauthorizedException("User not found");
        }
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
            youtubeSubscriberCount: user.youtubeSubscriberCount ?? undefined
        };
    }
} 