import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";
import { UnauthorizedException } from "../shared/http-exception";
import { verifyToken } from "../utils/jwt";
import { DeviceResponse } from "../modules/device-register/device-register.service";

export interface AuthRequest extends Request {
    users?: any;
    device?: DeviceResponse;
}

export const bearerTokenMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    logger.info(`Checking Bearer Token: ${authHeader}`);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException("Unauthorized: Please provide a valid Bearer token");
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = verifyToken(token);
        if (!decodedToken) {
            throw new UnauthorizedException("Invalid or expired Bearer token");
        }
        req.device = decodedToken as DeviceResponse;
        next();
    } catch (error) {
        next(new UnauthorizedException("Invalid or expired Bearer token"));
    }
}
