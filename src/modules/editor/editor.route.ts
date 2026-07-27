import { Router } from 'express';
import { EditorController } from './editor.controller';
import { editorService } from './editor.service';
import { validate } from '../../middlewares/validate.middleware';
import {
    createEditorProjectSchema,
    updateEdlSchema,
    updateCaptionsSchema,
    updateDetailsSchema,
    editorProjectIdParamsSchema,
} from './editor.z.schema';

const router = Router();
const editorController = new EditorController(editorService);

/**
 * @swagger
 * tags:
 *   name: Editor
 *   description: Video editing — trim/split/reorder/speed timelines and word-level captions
 */

/**
 * @swagger
 * /editor/create:
 *   post:
 *     summary: Create a new editor project
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sourceUploadId:
 *                 type: string
 *                 description: Existing upload to edit
 *               sourceUrl:
 *                 type: string
 *                 description: YouTube URL (AI hand-off path — downloads the section first)
 *               timestampStart:
 *                 type: string
 *               timestampEnd:
 *                 type: string
 *     responses:
 *       201:
 *         description: Editor project created
 */
router.post('/create', validate(createEditorProjectSchema, 'body'), editorController.create);

/**
 * @swagger
 * /editor/get/{id}:
 *   get:
 *     summary: Get an editor project by ID
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Editor project fetched
 *       404:
 *         description: Editor project not found
 */
router.get('/get/:id', validate(editorProjectIdParamsSchema, 'params'), editorController.getById);

/**
 * @swagger
 * /editor/update/{id}:
 *   put:
 *     summary: Update a project's edit-decision-list (trim/split/reorder/speed)
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Timeline updated
 *       404:
 *         description: Editor project not found
 */
router.put(
    '/update/:id',
    validate(editorProjectIdParamsSchema, 'params'),
    validate(updateEdlSchema, 'body'),
    editorController.updateEdl
);

/**
 * @swagger
 * /editor/update-captions/{id}:
 *   put:
 *     summary: Update a project's caption track (manual edits, style changes)
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Captions updated
 *       404:
 *         description: Editor project not found
 */
router.put(
    '/update-captions/:id',
    validate(editorProjectIdParamsSchema, 'params'),
    validate(updateCaptionsSchema, 'body'),
    editorController.updateCaptions
);

/**
 * @swagger
 * /editor/update-details/{id}:
 *   put:
 *     summary: Update a project's publish metadata (title/description/hashtags)
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details updated
 *       404:
 *         description: Editor project not found
 */
router.put(
    '/update-details/:id',
    validate(editorProjectIdParamsSchema, 'params'),
    validate(updateDetailsSchema, 'body'),
    editorController.updateDetails
);

/**
 * @swagger
 * /editor/{id}/transcribe:
 *   post:
 *     summary: Extract audio and generate word-level captions via Groq Whisper
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transcription complete
 *       404:
 *         description: Editor project not found
 */
router.post('/:id/transcribe', validate(editorProjectIdParamsSchema, 'params'), editorController.transcribe);

/**
 * @swagger
 * /editor/{id}/render:
 *   post:
 *     summary: Render the final MP4 from the current EDL + caption track
 *     tags: [Editor]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Render complete
 *       404:
 *         description: Editor project not found
 */
router.post('/:id/render', validate(editorProjectIdParamsSchema, 'params'), editorController.render);

export default router;
