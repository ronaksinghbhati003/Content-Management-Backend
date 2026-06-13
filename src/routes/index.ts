import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes';
import userRoutes from '../modules/Auth/user.route';
import deviceRouter from '../modules/device-register/device-register.route';
import { accessTokenMiddleware } from '../middlewares/access-token.middleware';
import aiRouter from '../modules/ai/ai.route';
import contentRouter from '../modules/content/content.route';
import commonRouter from '../modules/common/common.route';
import seriesRouter from '../modules/series/series.route';
import uploadRouter from '../modules/upload/upload.route';
import publishRouter from '../modules/publish/publish.route';
import analyticsRouter from '../modules/analytics/analytics.route';

const router = Router();

/**
 * Central route aggregator.
 * All module routes are mounted here under the /api/v1 prefix.
 *
 * To add a new module:
 *   1. Create routes file in src/modules/<module>/<module>.routes.ts
 *   2. Import and mount it here
 */
router.use("/device", deviceRouter)
router.use('/user', userRoutes);
router.use(accessTokenMiddleware);
router.use('/health', healthRoutes);

router.use('/analytics', analyticsRouter);

router.use('/ai', aiRouter);
router.use('/content', contentRouter);
router.use('/series', seriesRouter);
router.use('/common', commonRouter);
router.use('/upload', uploadRouter);
router.use('/publish', publishRouter);

// ── Future modules ──────────────────────────────────────────────────────────
// router.use('/users', userRoutes);
// router.use('/articles', articleRoutes);
// router.use('/auth', authRoutes);

export default router;

