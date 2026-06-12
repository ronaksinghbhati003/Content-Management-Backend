import { Router } from 'express';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../middlewares/validate.middleware';
import { chatSchema, generateSchema } from './ai.z.schema';

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

export default aiRouter;
