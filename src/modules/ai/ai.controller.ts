import { Request, Response, NextFunction } from 'express';
import { AIService } from './ai.service';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { InternalServerException, BadRequestException } from '../../shared/http-exception';
import { ApiResponse } from '../../shared/api-response';
import logger from '../../config/logger';

export class AIController {
    private readonly aiService: AIService;

    constructor(aiService: AIService) {
        this.aiService = aiService;
    }

    chat = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { message } = req.body;
            // UserInterFace uses _id
            const userId = req.users?._id;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            logger.info(`AI Chat request from user: ${userId}`);
            
            const response = await this.aiService.chat(userId, message);

            res.status(200).json(ApiResponse.ok({ response }, "AI responded successfully"));
        } catch (error: any) {
            next(error);
        }
    }
}
