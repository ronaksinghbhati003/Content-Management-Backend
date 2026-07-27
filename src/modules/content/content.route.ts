import { Router } from 'express';
import { ContentController } from './content.controller';
import { contentService } from './content.service';
import { validate } from '../../middlewares/validate.middleware';
import {
    createContentSchema,
    updateContentSchema,
    contentIdParamsSchema,
    listContentQuerySchema,
} from './content.z.schema';

const router = Router();
const contentController = new ContentController(contentService);

/**
 * @swagger
 * tags:
 *   name: Content
 *   description: Content management operations
 */

/**
 * @swagger
 * /content/create:
 *   post:
 *     summary: Create new content
 *     tags: [Content]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - platform
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               hashtags:
 *                 type: array
 *                 items:
 *                   type: string
 *               platform:
 *                 type: string
 *                 enum: [youtube, instagram, tiktok, twitter, linkedin, other]
 *               status:
 *                 type: string
 *                 enum: [IDEA, PLANNED, IN_PROGRESS, REVIEW, SCHEDULED, PUBLISHED, ARCHIVED]
 *               contentType:
 *                 type: string
 *                 enum: [video, short, reel, post, thread, article, other]
 *               thumbnail:
 *                 type: string
 *               publishedDate:
 *                 type: string
 *                 format: date-time
 *               seriesId:
 *                 type: string
 *                 description: MongoDB ObjectId of the series this content belongs to (optional)
 *                 example: "6641f3c8e4b0c9a1d2f3e4a5"
 *     responses:
 *       201:
 *         description: Content created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/create', validate(createContentSchema, 'body'), contentController.create);

/**
 * @swagger
 * /content/list:
 *   get:
 *     summary: List all content for the authenticated user
 *     tags: [Content]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [IDEA, PLANNED, IN_PROGRESS, REVIEW, SCHEDULED, PUBLISHED, ARCHIVED]
 *         description: Filter by status
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [youtube, instagram, tiktok, twitter, linkedin, other]
 *         description: Filter by platform
 *       - in: query
 *         name: seriesId
 *         schema:
 *           type: string
 *         description: Filter content by series ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Contents fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/list', validate(listContentQuerySchema, 'query'), contentController.list);

/**
 * @swagger
 * /content/get/{id}:
 *   get:
 *     summary: Get content by ID
 *     tags: [Content]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Content not found
 */
router.get('/get/:id', validate(contentIdParamsSchema, 'params'), contentController.getById);

/**
 * @swagger
 * /content/update/{id}:
 *   put:
 *     summary: Update content
 *     tags: [Content]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               hashtags:
 *                 type: array
 *                 items:
 *                   type: string
 *               platform:
 *                 type: string
 *                 enum: [youtube, instagram, tiktok, twitter, linkedin, other]
 *               status:
 *                 type: string
 *                 enum: [IDEA, PLANNED, IN_PROGRESS, REVIEW, SCHEDULED, PUBLISHED, ARCHIVED]
 *               contentType:
 *                 type: string
 *                 enum: [video, short, reel, post, thread, article, other]
 *               thumbnail:
 *                 type: string
 *               publishedDate:
 *                 type: string
 *                 format: date-time
 *               seriesId:
 *                 type: string
 *                 description: MongoDB ObjectId of the series (set to null to remove from series)
 *                 example: "6641f3c8e4b0c9a1d2f3e4a5"
 *     responses:
 *       200:
 *         description: Content updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Content not found
 */
router.put(
    '/update/:id',
    validate(contentIdParamsSchema, 'params'),
    validate(updateContentSchema, 'body'),
    contentController.update
);

/**
 * @swagger
 * /content/delete/{id}:
 *   delete:
 *     summary: Delete content
 *     tags: [Content]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content ID
 *     responses:
 *       200:
 *         description: Content deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Content not found
 */
router.delete('/delete/:id', validate(contentIdParamsSchema, 'params'), contentController.delete);

export default router;
