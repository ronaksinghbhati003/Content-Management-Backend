import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { UploadController } from './upload.controller';
import { uploadService } from './upload.service';

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const ext = path.extname(file.originalname);
        cb(null, `video-${uniqueSuffix}${ext}`);
    },
});

// File filter — accept only video MIME types
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/webm',
        'video/mpeg',
        'video/3gpp',
        'video/x-flv',
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only video files are allowed.`));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB
    },
});

// Image / Thumbnail configuration
const imageStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const ext = path.extname(file.originalname);
        cb(null, `thumb-${uniqueSuffix}${ext}`);
    },
});

const imageFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only image files are allowed.`));
    }
};

const uploadImage = multer({
    storage: imageStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

const router = Router();
const uploadController = new UploadController(uploadService);

/**
 * @swagger
 * tags:
 *   name: Upload
 *   description: Video upload management
 */

/**
 * @swagger
 * /upload/video:
 *   post:
 *     summary: Upload a video file
 *     tags: [Upload]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - video
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video file (max 500MB)
 *     responses:
 *       201:
 *         description: Video uploaded successfully
 *       400:
 *         description: No file or invalid file type
 *       401:
 *         description: Unauthorized
 */
router.post('/video', upload.single('video'), uploadController.uploadVideo);

/**
 * @swagger
 * /upload/thumbnail:
 *   post:
 *     summary: Upload a thumbnail image file
 *     tags: [Upload]
 *     security:
 *       - accessAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - thumbnail
 *             properties:
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *                 description: Thumbnail image file (max 10MB)
 *     responses:
 *       201:
 *         description: Thumbnail uploaded successfully
 *       400:
 *         description: No file or invalid file type
 *       401:
 *         description: Unauthorized
 */
router.post('/thumbnail', uploadImage.single('thumbnail'), uploadController.uploadThumbnail);

/**
 * @swagger
 * /upload/list:
 *   get:
 *     summary: List all uploads for the user
 *     tags: [Upload]
 *     security:
 *       - accessAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Uploads fetched successfully
 */
router.get('/list', uploadController.list);

/**
 * @swagger
 * /upload/{id}:
 *   get:
 *     summary: Get upload by ID
 *     tags: [Upload]
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
 *         description: Upload fetched successfully
 *       404:
 *         description: Upload not found
 */
router.get('/:id', uploadController.getById);

/**
 * @swagger
 * /upload/{id}:
 *   delete:
 *     summary: Delete an upload
 *     tags: [Upload]
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
 *         description: Upload deleted successfully
 *       404:
 *         description: Upload not found
 */
router.delete('/:id', uploadController.delete);

export default router;
