import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { SeriesService } from './series.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import { CreateSeriesInput, UpdateSeriesInput } from './series.z.schema';

export class SeriesController {
    constructor(private readonly seriesService: SeriesService) {}

    /**
     * @route POST /api/v1/series/create
     * @desc  Create a new series (playlist)
     */
    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const data: CreateSeriesInput = req.body;

        const series = await this.seriesService.createSeries(userId, data);

        res.status(201).json(ApiResponse.created(series, 'Series created successfully'));
    });

    /**
     * @route GET /api/v1/series/get/:id
     * @desc  Get a series by ID
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const series = await this.seriesService.getSeriesById(userId, id);

        res.status(200).json(ApiResponse.ok(series, 'Series fetched successfully'));
    });

    /**
     * @route GET /api/v1/series/list
     * @desc  List all series for the authenticated user
     */
    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const { page, limit, status, platform } = req.query as any;

        const result = await this.seriesService.listSeries(userId, { page, limit, status, platform });

        res.status(200).json(
            ApiResponse.ok(result.data, 'Series fetched successfully', 200, result.meta as any)
        );
    });

    /**
     * @route PUT /api/v1/series/update/:id
     * @desc  Update a series by ID
     */
    update = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const data: UpdateSeriesInput = req.body;

        const series = await this.seriesService.updateSeries(userId, id, data);

        res.status(200).json(ApiResponse.ok(series, 'Series updated successfully'));
    });

    /**
     * @route DELETE /api/v1/series/delete/:id
     * @desc  Hard-delete a series by ID
     */
    delete = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        await this.seriesService.deleteSeries(userId, id);

        res.status(200).json(ApiResponse.ok(null, 'Series deleted successfully'));
    });

    /**
     * @route GET /api/v1/series/:id/contents
     * @desc  Get all content items that belong to a series
     */
    getContents = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const { page, limit } = req.query as any;

        const result = await this.seriesService.getSeriesContents(userId, id, { page, limit });

        res.status(200).json(
            ApiResponse.ok(result.data, 'Series contents fetched successfully', 200, result.meta as any)
        );
    });
}
