import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { AnalyticsService } from './analytics.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';

export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    /**
     * @route GET /api/v1/analytics
     * @desc Fetch dashboard analytics stats dynamically
     */
    getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const analyticsData = await this.analyticsService.getAnalytics(userId);
        res.status(200).json(ApiResponse.ok(analyticsData, 'Analytics fetched successfully'));
    });
}
