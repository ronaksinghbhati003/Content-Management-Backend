import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { RoadmapService } from './roadmap.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import { CreateRoadmapItemInput, UpdateRoadmapItemInput } from './roadmap.z.schema';

export class RoadmapController {
    constructor(private readonly roadmapService: RoadmapService) {}

    /**
     * @route POST /api/v1/roadmap/create
     * @desc Create a new roadmap item
     */
    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const data: CreateRoadmapItemInput = req.body;

        const item = await this.roadmapService.createRoadmapItem(userId, data);

        res.status(201).json(ApiResponse.created(item, 'Roadmap item created successfully'));
    });

    /**
     * @route GET /api/v1/roadmap/get/:id
     * @desc Get a roadmap item by id
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const item = await this.roadmapService.getRoadmapItemById(userId, id);

        res.status(200).json(ApiResponse.ok(item, 'Roadmap item fetched successfully'));
    });

    /**
     * @route GET /api/v1/roadmap/list
     * @desc List all roadmap items for the user
     */
    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const { status } = req.query as any;

        const items = await this.roadmapService.listRoadmapItems(userId, { status });

        res.status(200).json(ApiResponse.ok(items, 'Roadmap items fetched successfully'));
    });

    /**
     * @route PUT /api/v1/roadmap/update/:id
     * @desc Update a roadmap item by id
     */
    update = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const data: UpdateRoadmapItemInput = req.body;

        const item = await this.roadmapService.updateRoadmapItem(userId, id, data);

        res.status(200).json(ApiResponse.ok(item, 'Roadmap item updated successfully'));
    });

    /**
     * @route DELETE /api/v1/roadmap/delete/:id
     * @desc Delete a roadmap item by id
     */
    delete = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        await this.roadmapService.deleteRoadmapItem(userId, id);

        res.status(200).json(ApiResponse.ok(null, 'Roadmap item deleted successfully'));
    });
}
