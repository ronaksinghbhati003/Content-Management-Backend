import { Router } from 'express';
import { commonController } from './common.controller';
import { validate } from '../../middlewares/validate.middleware';
import { softDeleteSchema } from './common.z.schema';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Common
 *   description: Shared/Generic utility operations
 */

/**
 * @swagger
 * /common/soft-delete:
 *   post:
 *     summary: Softly delete a resource from any collection
 *     tags: [Common]
 *     security:
 *       - AccessToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionName
 *               - id
 *             properties:
 *               collectionName:
 *                 type: string
 *                 description: Name of the collection (e.g., 'Content', 'Users')
 *               id:
 *                 type: string
 *                 description: MongoDB ID of the document
 *     responses:
 *       200:
 *         description: Soft delete successful
 *       400:
 *         description: Invalid input or model not found
 *       404:
 *         description: Resource not found
 */
router.post('/soft-delete', validate(softDeleteSchema, 'body'), commonController.softDelete);

export default router;
