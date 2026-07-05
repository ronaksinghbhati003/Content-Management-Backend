import jwt from "jsonwebtoken";
import config from "../config";
import { UnauthorizedException } from "../shared/http-exception";

const JWT_SECRET = config.jwtSecret;
const JWT_EXPIRES_IN = config.jwtExpiresIn;


export const generateToken = (payload: any) => {
    try {
        return jwt.sign(payload, JWT_SECRET as jwt.Secret, {
            expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
        });
    } catch (error) {
        throw error;
    }
}

export const verifyToken = (token: string) => {
    try {
        return jwt.verify(token, JWT_SECRET as jwt.Secret);
    } catch (error: any) {
        if (error.name === "TokenExpiredError") {
            throw new UnauthorizedException("Token expired");
        }
        throw new UnauthorizedException("Invalid token");
    }
}