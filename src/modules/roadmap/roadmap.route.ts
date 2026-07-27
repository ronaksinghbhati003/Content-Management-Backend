import { Router } from 'express';
import { RoadmapController } from './roadmap.controller';
import { roadmapService } from './roadmap.service';
import { validate } from '../../middlewares/validate.middleware';
import {
    createRoadmapItemSchema,
    updateRoadmapItemSchema,
    roadmapIdParamsSchema,
    listRoadmapQuerySchema,
} from './roadmap.z.schema';

const router = Router();
const roadmapController = new RoadmapController(roadmapService);

/**
 * @swagger
 * tags:
 *   name: Roadmap
 *   description: Content roadmap board operations
 */

/**
 * @swagger
 * /roadmap/create:
 *   post:
 *     summary: Create a new roadmap item
 *     tags: [Roadmap]
 *     security:
 *       - accessAuth: []
 *     responses:
 *       201:
 *         description: Roadmap item created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/create', validate(createRoadmapItemSchema, 'body'), roadmapController.create);

/**
 * @swagger
 * /roadmap/list:
 *   get:
 *     summary: List all roadmap items for the authenticated user
 *     tags: [Roadmap]
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Roadmap items fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/list', validate(listRoadmapQuerySchema, 'query'), roadmapController.list);

/**
 * @swagger
 * /roadmap/get/{id}:
 *   get:
 *     summary: Get a roadmap item by ID
 *     tags: [Roadmap]
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Roadmap item fetched successfully
 *       404:
 *         description: Roadmap item not found
 */
router.get('/get/:id', validate(roadmapIdParamsSchema, 'params'), roadmapController.getById);

/**
 * @swagger
 * /roadmap/update/{id}:
 *   put:
 *     summary: Update a roadmap item
 *     tags: [Roadmap]
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Roadmap item updated successfully
 *       404:
 *         description: Roadmap item not found
 */
router.put(
    '/update/:id',
    validate(roadmapIdParamsSchema, 'params'),
    validate(updateRoadmapItemSchema, 'body'),
    roadmapController.update
);

/**
 * @swagger
 * /roadmap/delete/{id}:
 *   delete:
 *     summary: Delete a roadmap item
 *     tags: [Roadmap]
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Roadmap item deleted successfully
 *       404:
 *         description: Roadmap item not found
 */
router.delete('/delete/:id', validate(roadmapIdParamsSchema, 'params'), roadmapController.delete);

export default router;
