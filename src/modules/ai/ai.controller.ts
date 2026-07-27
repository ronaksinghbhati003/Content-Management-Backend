import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AIService, ContentPlan } from './ai.service';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { InternalServerException, BadRequestException } from '../../shared/http-exception';
import { ApiResponse } from '../../shared/api-response';
import { contentService } from '../content/content.service';
import { uploadService } from '../upload/upload.service';
import logger from '../../config/logger';
import config from '../../config';

const IMAGE_EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
};

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
     * POST /ai/suggest — Quick title suggestions (4 items, with spelling/casing fix)
     */
    suggest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { type, prompt, description, wordCount } = req.body;
            const userId = req.users?._id;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            logger.info(`AI Suggest request from user: ${userId}, type: ${type}, wordCount: ${wordCount}`);

            const suggestions = await this.aiService.generateSuggestions(userId as string, type, prompt || '', wordCount, description);

            res.status(200).json(ApiResponse.ok({ suggestions }, "Suggestions generated successfully"));
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

    /**
     * POST /ai/thumbnail — Generate a thumbnail image from a text prompt and save it to the Media Library
     */
    generateThumbnail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { prompt, size } = req.body;
            const userId = req.users?._id as string;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            logger.info(`AI Thumbnail request from user: ${userId} (size: ${size || 'youtube'})`);

            const { buffer, mimeType } = await this.aiService.generateThumbnailImage(userId, prompt, size);

            const uploadsDir = path.resolve(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            const ext = IMAGE_EXTENSIONS[mimeType] || 'png';
            const fileName = `thumb-ai-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
            fs.writeFileSync(path.join(uploadsDir, fileName), buffer);

            // Use the configured public base URL, not the request's own Host header —
            // the frontend always talks to this backend over plain localhost in dev,
            // so req.get('host') would silently produce a localhost URL even when
            // SERVER_BASE_URL is correctly set to a public tunnel. Instagram's Graph
            // API needs a URL it can actually fetch from the internet.
            const upload = await uploadService.createUpload(userId, {
                originalName: `${prompt.slice(0, 40)}.${ext}`,
                fileName,
                mimeType,
                size: buffer.length,
                url: `${config.serverBaseUrl}/uploads/${fileName}`,
            });

            res.status(201).json(ApiResponse.created(upload, "Thumbnail generated successfully"));
        } catch (error: any) {
            next(error);
        }
    }

    /**
     * POST /ai/rewrite — Rewrite a piece of script text in a given tone/instruction
     */
    rewrite = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { text, tone, instruction } = req.body;
            const userId = req.users?._id as string;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            const rewritten = await this.aiService.rewriteScript(userId, text, tone, instruction);
            res.status(200).json(ApiResponse.ok({ rewritten }, "Text rewritten successfully"));
        } catch (error: any) {
            next(error);
        }
    }

    /**
     * POST /ai/highlights — Suggest key lines in a script worth highlighting
     */
    highlights = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { text } = req.body;
            const userId = req.users?._id as string;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            const highlights = await this.aiService.suggestHighlights(userId, text);
            res.status(200).json(ApiResponse.ok({ highlights }, "Highlights generated successfully"));
        } catch (error: any) {
            next(error);
        }
    }

    /**
     * POST /ai/research — Generate a full research brief (titles, outline, thumbnail ideas,
     * keywords, common questions, and real competitor videos) for a topic
     */
    research = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { topic } = req.body;
            const userId = req.users?._id as string;

            if (!userId) {
                throw new InternalServerException("User ID not found in request context.");
            }

            logger.info(`AI Research request from user: ${userId}, topic="${topic}"`);

            const [research, youtubeQuery] = await Promise.all([
                this.aiService.generateResearch(userId, topic),
                this.aiService.refineYouTubeQuery(topic),
            ]);
            const competitorVideos = await this.aiService.fetchCompetitorVideos(youtubeQuery);
            const contentGap = await this.aiService.generateContentGap(
                userId,
                topic,
                competitorVideos.map(v => v.title),
                research.trendingKeywords || []
            );

            res.status(200).json(ApiResponse.ok({
                ...research,
                competitorVideos,
                competitorVideosAvailable: !!config.youtubeApiKey,
                contentGap,
            }, "Research generated successfully"));
        } catch (error: any) {
            next(error);
        }
    }
}
