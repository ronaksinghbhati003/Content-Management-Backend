import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { analyticsService } from './analytics.service';
import { asyncHandler } from '../../shared/async-handler';

const analyticsRouter = Router();
const analyticsController = new AnalyticsController(analyticsService);

/**
 * @swagger
 * /analytics:
 *   get:
 *     summary: Fetch dynamic dashboard analytics
 *     tags: [Analytics]
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Analytics fetched successfully
 *       401:
 *         description: Unauthorized
 */
analyticsRouter.get('/', analyticsController.getAnalytics);

export default analyticsRouter;
