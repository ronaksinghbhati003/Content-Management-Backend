import { Router } from 'express';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../middlewares/validate.middleware';
import { chatSchema, generateSchema, suggestSchema, thumbnailSchema, rewriteSchema, highlightsSchema, researchSchema } from './ai.z.schema';

const aiRouter = Router();

// Dependency Injection
const aiService = new AIService();
const aiController = new AIController(aiService);

/**
 * @swagger
 * /ai/chat:
 *   post:
 *     summary: Chat with the AI Agent
 *     description: Send a prompt to the AI agent for general conversation.
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "I want a 5-part YouTube series on kettlebell training for beginners"
 *     responses:
 *       200:
 *         description: AI response generated successfully
 *       400:
 *         description: Validation error or Bad request
 *       401:
 *         description: Unauthorized
 */
aiRouter.post('/chat', validate(chatSchema), asyncHandler(aiController.chat));

/**
 * @swagger
 * /ai/generate:
 *   post:
 *     summary: Generate a complete content plan
 *     description: |
 *       Send a content idea prompt and receive a full content plan including:
 *       title options, SEO description, tags, script outline, and thumbnail prompt.
 *       Optionally auto-saves the result to the Content Library.
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 example: "A YouTube video about 5 morning habits for productivity"
 *               autoSave:
 *                 type: boolean
 *                 default: false
 *                 description: If true, automatically saves the generated content to the Content Library
 *     responses:
 *       200:
 *         description: Content plan generated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
aiRouter.post('/generate', validate(generateSchema), asyncHandler(aiController.generate));

/**
 * @swagger
 * /ai/suggest:
 *   post:
 *     summary: Generate 4 title suggestions (with spelling/casing fix if title provided)
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [title, description, script]
 *               prompt:
 *                 type: string
 *                 description: Existing draft text to fix, or topic context for fresh suggestions
 *     responses:
 *       200:
 *         description: "Returns { suggestions: string[] } with 4 items"
 */
aiRouter.post('/suggest', validate(suggestSchema), asyncHandler(aiController.suggest));

/**
 * @swagger
 * /ai/thumbnail:
 *   post:
 *     summary: Generate a thumbnail image from a text prompt
 *     description: |
 *       Uses Gemini's image model to generate a thumbnail from the given prompt and
 *       saves it directly to the Media Library (same as a manual upload). Falls back
 *       to Pollinations.ai (free, no key required) if Gemini has no key configured
 *       or its image quota/billing rejects the request.
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 example: "A neon cyberpunk city skyline at night, bold title text space on the left"
 *     responses:
 *       201:
 *         description: Thumbnail generated and saved to Media Library
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
aiRouter.post('/thumbnail', validate(thumbnailSchema), asyncHandler(aiController.generateThumbnail));

/**
 * @swagger
 * /ai/rewrite:
 *   post:
 *     summary: Rewrite a piece of script text in a given tone/instruction
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *               tone:
 *                 type: string
 *                 example: "Energetic"
 *               instruction:
 *                 type: string
 *                 example: "Make it punchier and shorter"
 *     responses:
 *       200:
 *         description: "Returns { rewritten: string }"
 */
aiRouter.post('/rewrite', validate(rewriteSchema), asyncHandler(aiController.rewrite));

/**
 * @swagger
 * /ai/highlights:
 *   post:
 *     summary: Suggest key lines in a script worth highlighting (hooks, CTAs, stats)
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Returns { highlights: string[] } — exact substrings from the input text"
 */
aiRouter.post('/highlights', validate(highlightsSchema), asyncHandler(aiController.highlights));

/**
 * @swagger
 * /ai/research:
 *   post:
 *     summary: Generate a full research brief for a topic
 *     description: |
 *       Given a topic, returns suggested titles, a script outline, thumbnail ideas,
 *       trending keywords, common questions (all AI-generated), plus real competitor
 *       videos from YouTube Data API v3 (if YOUTUBE_API_KEY is configured).
 *     tags: [AI Agent]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *             properties:
 *               topic:
 *                 type: string
 *                 example: "How to learn React"
 *     responses:
 *       200:
 *         description: Research brief generated successfully
 */
aiRouter.post('/research', validate(researchSchema), asyncHandler(aiController.research));

export default aiRouter;
