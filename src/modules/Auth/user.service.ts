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
                updatedAt: user.updatedAt
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
            updatedAt: user.updatedAt
        }
    }
} 