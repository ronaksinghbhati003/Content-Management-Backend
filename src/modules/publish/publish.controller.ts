import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { PublishService } from './publish.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';

export class PublishController {
    constructor(private readonly publishService: PublishService) {}

    /**
     * @route POST /api/v1/publish/create
     * @desc Create a new publish job
     */
    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const job = await this.publishService.createPublishJob(userId, req.body);
        res.status(201).json(ApiResponse.created(job, 'Publish job created successfully'));
    });

    /**
     * @route GET /api/v1/publish/list
     * @desc List all publish jobs for the user
     */
    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const { page, limit, status, contentId } = req.query as any;
        const result = await this.publishService.listPublishJobs(userId, { page, limit, status, contentId });
        res.status(200).json(ApiResponse.ok(result.data, 'Publish jobs fetched successfully', 200, result.meta));
    });

    /**
     * @route GET /api/v1/publish/:id
     * @desc Get a single publish job
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const job = await this.publishService.getPublishJobById(userId, id);
        res.status(200).json(ApiResponse.ok(job, 'Publish job fetched successfully'));
    });

    /**
     * @route DELETE /api/v1/publish/:id
     * @desc Cancel a scheduled publish job
     */
    cancel = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const job = await this.publishService.cancelPublishJob(userId, id);
        res.status(200).json(ApiResponse.ok(job, 'Publish job cancelled'));
    });
}
