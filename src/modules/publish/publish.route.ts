import { Router } from 'express';
import { PublishController } from './publish.controller';
import { publishService } from './publish.service';

const router = Router();
const publishController = new PublishController(publishService);

/**
 * @swagger
 * tags:
 *   name: Publish
 *   description: Cross-platform video publishing
 */

/**
 * @swagger
 * /publish/create:
 *   post:
 *     summary: Create a publish job (immediate or scheduled)
 *     tags: [Publish]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uploadId
 *               - title
 *               - platforms
 *               - scheduledAt
 *             properties:
 *               uploadId:
 *                 type: string
 *                 description: MongoDB ObjectId of the uploaded video
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               platforms:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [youtube, youtube_shorts, instagram_reels, tiktok]
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: ISO date-time. Use current/past time for immediate publish.
 *     responses:
 *       201:
 *         description: Publish job created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Upload not found
 */
router.post('/create', publishController.create);

// ── YouTube OAuth2 Integration Routes ─────────────────────────────────────────
router.get('/youtube/connect', publishController.connectYouTube);
router.get('/youtube/callback', publishController.youtubeCallback);
router.get('/youtube/status', publishController.youtubeStatus);
router.post('/youtube/disconnect', publishController.disconnectYouTube);


/**
 * @swagger
 * /publish/list:
 *   get:
 *     summary: List publish jobs for the user
 *     tags: [Publish]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, scheduled, publishing, published, failed, cancelled]
 *     responses:
 *       200:
 *         description: Jobs fetched
 */
router.get('/list', publishController.list);

/**
 * @swagger
 * /publish/{id}:
 *   get:
 *     summary: Get a single publish job
 *     tags: [Publish]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job fetched
 *       404:
 *         description: Job not found
 */
router.get('/:id', publishController.getById);

/**
 * @swagger
 * /publish/{id}:
 *   delete:
 *     summary: Cancel a scheduled publish job
 *     tags: [Publish]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job cancelled
 *       400:
 *         description: Job cannot be cancelled
 *       404:
 *         description: Job not found
 */
router.delete('/:id', publishController.cancel);

export default router;
