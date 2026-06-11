import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { ContentService } from './content.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import { CreateContentInput, UpdateContentInput } from './content.z.schema';

export class ContentController {
    constructor(private readonly contentService: ContentService) {}

    /**
     * @route POST /api/v1/content/create
     * @desc Create new content
     */
    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const data: CreateContentInput = req.body;

        const content = await this.contentService.createContent(userId, data);

        res.status(201).json(ApiResponse.created(content, 'Content created successfully'));
    });

    /**
     * @route GET /api/v1/content/get/:id
     * @desc Get content by id
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const content = await this.contentService.getContentById(userId, id);

        res.status(200).json(ApiResponse.ok(content, 'Content fetched successfully'));
    });

    /**
     * @route GET /api/v1/content/list
     * @desc List all contents for the user
     */
    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const { page, limit, status, platform, seriesId } = req.query as any;

        const result = await this.contentService.listContent(userId, {
            page,
            limit,
            status,
            platform,
            seriesId,
        });

        res.status(200).json(ApiResponse.ok(result.data, 'Contents fetched successfully', 200, result.meta));
    });

    /**
     * @route PUT /api/v1/content/update/:id
     * @desc Update content by id
     */
    update = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const data: UpdateContentInput = req.body;

        const content = await this.contentService.updateContent(userId, id, data);

        res.status(200).json(ApiResponse.ok(content, 'Content updated successfully'));
    });

    /**
     * @route DELETE /api/v1/content/delete/:id
     * @desc Delete content by id (Hard delete, soft delete handled by common API)
     */
    delete = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        await this.contentService.deleteContent(userId, id);

        res.status(200).json(ApiResponse.ok(null, 'Content deleted successfully'));
    });
}

