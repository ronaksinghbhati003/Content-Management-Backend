import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { EditorService } from './editor.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import { CreateEditorProjectInput, UpdateEdlInput, UpdateCaptionsInput, UpdateDetailsInput } from './editor.z.schema';

export class EditorController {
    constructor(private readonly editorService: EditorService) {}

    /**
     * @route POST /api/v1/editor/create
     * @desc Create a new editor project from an existing upload or a YouTube clip range
     */
    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const data: CreateEditorProjectInput = req.body;

        const project = await this.editorService.createProject(userId, data);

        res.status(201).json(ApiResponse.created(project, 'Editor project created successfully'));
    });

    /**
     * @route GET /api/v1/editor/get/:id
     * @desc Get an editor project by id
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const project = await this.editorService.getProject(userId, id);

        res.status(200).json(ApiResponse.ok(project, 'Editor project fetched successfully'));
    });

    /**
     * @route PUT /api/v1/editor/update/:id
     * @desc Update the edit-decision-list (trim/split/reorder/speed) for a project
     */
    updateEdl = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const data: UpdateEdlInput = req.body;

        const project = await this.editorService.updateEdl(userId, id, data);

        res.status(200).json(ApiResponse.ok(project, 'Timeline updated successfully'));
    });

    /**
     * @route PUT /api/v1/editor/update-captions/:id
     * @desc Update the caption track (manual text edits, style changes) for a project
     */
    updateCaptions = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const data: UpdateCaptionsInput = req.body;

        const project = await this.editorService.updateCaptions(userId, id, data);

        res.status(200).json(ApiResponse.ok(project, 'Captions updated successfully'));
    });

    /**
     * @route PUT /api/v1/editor/update-details/:id
     * @desc Update the publish metadata (title/description/hashtags) for a project
     */
    updateDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const data: UpdateDetailsInput = req.body;

        const project = await this.editorService.updateDetails(userId, id, data);

        res.status(200).json(ApiResponse.ok(project, 'Details updated successfully'));
    });

    /**
     * @route POST /api/v1/editor/:id/transcribe
     * @desc Extract audio and generate word-level captions via Groq Whisper
     */
    transcribe = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const project = await this.editorService.transcribe(userId, id);

        res.status(200).json(ApiResponse.ok(project, 'Transcription complete'));
    });

    /**
     * @route POST /api/v1/editor/:id/render
     * @desc Render the final MP4 from the current EDL + caption track
     */
    render = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;

        const project = await this.editorService.render(userId, id);

        res.status(200).json(ApiResponse.ok(project, 'Render complete'));
    });
}
