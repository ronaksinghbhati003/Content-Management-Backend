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

router.get('/analytics', (req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Analytics fetched successfully',
    data: {
      stats: [
        { name: "Total Views", iconKey: "Play", value: "2.4M", change: "+12%" },
        { name: "Subscribers", iconKey: "Users", value: "84.2K", change: "+840" },
        { name: "Avg Watch Time", iconKey: "Clock", value: "4m 32s", change: "+5%" },
        { name: "Revenue", iconKey: "TrendingUp", value: "$12.4K", change: "+15%" }
      ],
      aiSuggestions: [
        {
          id: "sug-1",
          iconKey: "Zap",
          impact: "Critical",
          confidence: 94,
          title: "Shorts Strategy",
          description: "Your YouTube Shorts engagement is up 40%. Focus on publishing 3 new Shorts on kettlebell training this week.",
          action: "Draft Script"
        },
        {
          id: "sug-2",
          iconKey: "Clock",
          impact: "High",
          confidence: 88,
          title: "Posting Times",
          description: "Your Instagram audience is most active on Sundays at 4:00 PM. Reschedule your upcoming post to maximize reach.",
          action: "Reschedule"
        },
        {
          id: "sug-3",
          iconKey: "Sparkles",
          impact: "Medium",
          confidence: 82,
          title: "Thumbnail Optimization",
          description: "Re-generate the thumbnail for 'Morning Habits for Productivity' using brighter colors to improve click-through rate.",
          action: "Generate New"
        }
      ],
      roadmap: [
        { title: "Gym Motivation Series", due: "June 15", status: "Scheduled", color: "bg-emerald-500" },
        { title: "Morning Productivity Hacks", due: "June 18", status: "In Progress", color: "bg-amber-500" },
        { title: "Kettlebell Workout for Beginners", due: "June 20", status: "Draft", color: "bg-indigo-500" }
      ],
      platformPerformance: []
    }
  });
});

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

