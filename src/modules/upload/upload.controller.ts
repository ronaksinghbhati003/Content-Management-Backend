import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { UploadService } from './upload.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import config from '../../config';

export class UploadController {
    constructor(private readonly uploadService: UploadService) {}

    /**
     * @route POST /api/v1/upload/video
     * @desc Upload a video file
     */
    uploadVideo = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;

        if (!req.file) {
            res.status(400).json(ApiResponse.error(400, 'No video file provided'));
            return;
        }

        const file = req.file;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/uploads/${file.filename}`;

        const upload = await this.uploadService.createUpload(userId, {
            originalName: file.originalname,
            fileName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            url: fileUrl,
        });

        res.status(201).json(ApiResponse.created(upload, 'Video uploaded successfully'));
    });

    /**
     * @route POST /api/v1/upload/thumbnail
     * @desc Upload a thumbnail image file
     */
    uploadThumbnail = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;

        if (!req.file) {
            res.status(400).json(ApiResponse.error(400, 'No thumbnail file provided'));
            return;
        }

        const file = req.file;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/uploads/${file.filename}`;

        const upload = await this.uploadService.createUpload(userId, {
            originalName: file.originalname,
            fileName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            url: fileUrl,
        });

        res.status(201).json(ApiResponse.created(upload, 'Thumbnail uploaded successfully'));
    });

    /**
     * @route GET /api/v1/upload/list
     * @desc List all uploads for the user
     */
    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const { page, limit } = req.query as any;

        const result = await this.uploadService.listUploads(userId, { page, limit });

        res.status(200).json(ApiResponse.ok(result.data, 'Uploads fetched successfully', 200, result.meta));
    });

    /**
     * @route GET /api/v1/upload/:id
     * @desc Get upload by id
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const upload = await this.uploadService.getUploadById(userId, id);

        res.status(200).json(ApiResponse.ok(upload, 'Upload fetched successfully'));
    });

    /**
     * @route DELETE /api/v1/upload/:id
     * @desc Delete upload by id
     */
    delete = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        await this.uploadService.deleteUpload(userId, id);

        res.status(200).json(ApiResponse.ok(null, 'Upload deleted successfully'));
    });
}
