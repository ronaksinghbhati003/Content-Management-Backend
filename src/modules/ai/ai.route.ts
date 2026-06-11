import { Router } from 'express';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { asyncHandler } from '../../shared/async-handler';
import { validate } from '../../middlewares/validate.middleware';
import { chatSchema } from './ai.z.schema';

const aiRouter = Router();

// Dependency Injection
const aiService = new AIService();
const aiController = new AIController(aiService);

/**
 * @swagger
 * /ai/chat:
 *   post:
 *     summary: Chat with the AI Agent
 *     description: Send a prompt to the AI agent to generate content ideas, scripts, or schedules.
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

export default aiRouter;
