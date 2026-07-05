import { Router } from 'express';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { asyncHandler } from '../../shared/async-handler';

const router = Router();

// ── Dependency instantiation ────────────────────────────────────────────────
const healthService = new HealthService();
const healthController = new HealthController(healthService);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Server health check
 *     description: Returns server uptime, memory usage, and system information
 *     tags:
 *       - Health
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: healthy
 *                         uptime:
 *                           type: number
 *                           example: 12345
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *                         memory:
 *                           type: object
 *                           properties:
 *                             heapUsed:
 *                               type: string
 *                               example: "12.34 MB"
 *                             heapTotal:
 *                               type: string
 *                               example: "20.00 MB"
 *                             rss:
 *                               type: string
 *                               example: "45.67 MB"
 *                         system:
 *                           type: object
 *                           properties:
 *                             platform:
 *                               type: string
 *                               example: win32
 *                             cpus:
 *                               type: number
 *                               example: 8
 */
router.get('/', asyncHandler(healthController.getHealth));

export default router;
