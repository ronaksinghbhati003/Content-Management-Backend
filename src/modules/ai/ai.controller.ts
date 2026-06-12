import { Request, Response, NextFunction } from 'express';
import { AIService, ContentPlan } from './ai.service';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { InternalServerException, BadRequestException } from '../../shared/http-exception';
import { ApiResponse } from '../../shared/api-response';
import { contentService } from '../content/content.service';
import logger from '../../config/logger';

export class AIController {
    private readonly aiService: AIService;

    constructor(aiService: AIService) {
        this.aiService = aiService;
    }

    /**
     * POST /ai/chat — Existing conversational chat
     */
    chat = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { message } = req.body;
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

    /**
     * POST /ai/generate — Multi-step content plan generation
     */
    generate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { prompt, autoSave } = req.body;
            const userId = req.users?._id;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            logger.info(`AI Generate request from user: ${userId}, autoSave: ${autoSave}`);

            // Run the multi-step pipeline
            const plan: ContentPlan = await this.aiService.generateContentPlan(userId as string, prompt);

            let savedContentId: string | null = null;

            // Auto-save to Content Library if requested
            if (autoSave) {
                try {
                    type PlatformType = 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'linkedin' | 'other';
                    const platformMap: Record<string, PlatformType> = {
                        youtube: 'youtube',
                        instagram: 'instagram',
                        tiktok: 'tiktok',
                        twitter: 'twitter',
                        linkedin: 'linkedin',
                    };
                    const platform: PlatformType = platformMap[plan.intent.platform] || 'youtube';

                    const contentData = {
                        title: plan.titles[0]?.title || prompt,
                        description: plan.metadata.description,
                        tags: plan.metadata.tags,
                        hashtags: plan.metadata.hashtags,
                        platform: [platform],
                        status: 'IDEA' as const,
                        contentType: (plan.intent.format === 'short' || plan.intent.format === 'reel')
                            ? 'short' as const
                            : plan.intent.format === 'article'
                                ? 'article' as const
                                : 'video' as const,
                    };

                    const saved = await contentService.createContent(userId as string, contentData);
                    savedContentId = (saved._id as any).toString();
                    logger.info(`AI-generated content auto-saved with ID: ${savedContentId}`);
                } catch (saveErr: any) {
                    logger.error(`Failed to auto-save AI content: ${saveErr.message}`);
                    // Don't fail the whole request if save fails
                }
            }

            res.status(200).json(
                ApiResponse.ok(
                    { plan, savedContentId },
                    "Content plan generated successfully"
                )
            );
        } catch (error: any) {
            next(error);
        }
    }
}
