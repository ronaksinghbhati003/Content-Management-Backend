import { Router } from 'express';
import { SeriesController } from './series.controller';
import { seriesService } from './series.service';
import { validate } from '../../middlewares/validate.middleware';
import {
    createSeriesSchema,
    updateSeriesSchema,
    seriesIdParamsSchema,
    listSeriesQuerySchema,
    seriesContentsQuerySchema,
} from './series.z.schema';

const router = Router();
const seriesController = new SeriesController(seriesService);

/**
 * @swagger
 * tags:
 *   name: Series
 *   description: Series (playlist) management operations
 */

/**
 * @swagger
 * /series/create:
 *   post:
 *     summary: Create a new series
 *     description: Creates a new series (playlist) that content items can be linked to via their seriesId field.
 *     tags: [Series]
 *     security:
 *       - s: []
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
 *                 example: "My YouTube Tutorial Playlist"
 *               description:
 *                 type: string
 *                 example: "A series of beginner tutorials on Node.js"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["nodejs", "backend"]
 *               platform:
 *                 type: string
 *                 enum: [youtube, instagram, tiktok, twitter, linkedin, other]
 *                 example: youtube
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DRAFT, ARCHIVED]
 *                 example: DRAFT
 *               thumbnail:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/thumbnail.png"
 *     responses:
 *       201:
 *         description: Series created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/create', validate(createSeriesSchema, 'body'), seriesController.create);

/**
 * @swagger
 * /series/list:
 *   get:
 *     summary: List all series for the authenticated user
 *     tags: [Series]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page (default 10)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, DRAFT, ARCHIVED]
 *         description: Filter by status
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [youtube, instagram, tiktok, twitter, linkedin, other]
 *         description: Filter by platform
 *     responses:
 *       200:
 *         description: Series fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/list', validate(listSeriesQuerySchema, 'query'), seriesController.list);

/**
 * @swagger
 * /series/get/{id}:
 *   get:
 *     summary: Get a series by ID
 *     tags: [Series]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Series ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Series fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Series not found
 */
router.get('/get/:id', validate(seriesIdParamsSchema, 'params'), seriesController.getById);

/**
 * @swagger
 * /series/{id}/contents:
 *   get:
 *     summary: Get all content items that belong to a series
 *     description: Returns a paginated list of content items whose seriesId matches the given series.
 *     tags: [Series]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Series ID (MongoDB ObjectId)
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
 *     responses:
 *       200:
 *         description: Series contents fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Series not found
 */
router.get(
    '/:id/contents',
    validate(seriesIdParamsSchema, 'params'),
    validate(seriesContentsQuerySchema, 'query'),
    seriesController.getContents
);

/**
 * @swagger
 * /series/update/{id}:
 *   put:
 *     summary: Update a series by ID
 *     tags: [Series]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Series ID
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
 *               platform:
 *                 type: string
 *                 enum: [youtube, instagram, tiktok, twitter, linkedin, other]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DRAFT, ARCHIVED]
 *               thumbnail:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Series updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Series not found
 */
router.put(
    '/update/:id',
    validate(seriesIdParamsSchema, 'params'),
    validate(updateSeriesSchema, 'body'),
    seriesController.update
);

/**
 * @swagger
 * /series/delete/{id}:
 *   delete:
 *     summary: Delete a series by ID
 *     tags: [Series]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Series ID
 *     responses:
 *       200:
 *         description: Series deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Series not found
 */
router.delete('/delete/:id', validate(seriesIdParamsSchema, 'params'), seriesController.delete);

export default router;
