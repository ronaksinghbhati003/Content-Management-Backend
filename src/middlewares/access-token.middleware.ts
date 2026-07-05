import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";
import { UnauthorizedException } from "../shared/http-exception";
import { verifyToken } from "../utils/jwt";
import { UserInterFace } from "../modules/Auth/user.service";

export interface AuthRequest extends Request {
    users?: UserInterFace;
    device?: any;
}

export const accessTokenMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    // Bypass auth check for YouTube OAuth redirect callback
    if (req.path.includes('/publish/youtube/callback')) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    logger.info(`Checking Access Token: ${authHeader}`);

    if (!authHeader || !authHeader.startsWith('Access ')) {
        throw new UnauthorizedException("Unauthorized: Please provide a valid Access token");
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = verifyToken(token);
        if (!decodedToken) {
            throw new UnauthorizedException("Invalid or expired Access token");
        }
        req.users = decodedToken as UserInterFace;
        next();
    } catch (error) {
        next(new UnauthorizedException("Invalid or expired Access token"));
    }
}
