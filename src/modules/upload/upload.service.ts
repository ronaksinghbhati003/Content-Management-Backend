import { Types } from 'mongoose';
import Upload, { IUpload } from './upload.schema';
import { NotFoundException } from '../../shared/http-exception';
import fs from 'fs';
import path from 'path';

export class UploadService {
    /**
     * Create a new upload record after file is saved to disk
     */
    async createUpload(userId: string, fileData: {
        originalName: string;
        fileName: string;
        mimeType: string;
        size: number;
        url: string;
    }): Promise<IUpload> {
        const upload = new Upload({
            userId: new Types.ObjectId(userId),
            ...fileData,
            status: 'ready',
        });
        return await upload.save();
    }

    /**
     * List all uploads for a user
     */
    async listUploads(userId: string, query: { page?: number; limit?: number }) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const filter = { userId: new Types.ObjectId(userId) };

        const [data, total] = await Promise.all([
            Upload.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Upload.countDocuments(filter),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get a single upload by ID
     */
    async getUploadById(userId: string, uploadId: string): Promise<IUpload> {
        const upload = await Upload.findOne({
            _id: new Types.ObjectId(uploadId),
            userId: new Types.ObjectId(userId),
        });

        if (!upload) {
            throw new NotFoundException('Upload not found');
        }

        return upload;
    }

    /**
     * Delete an upload record and its file from disk
     */
    async deleteUpload(userId: string, uploadId: string): Promise<void> {
        const upload = await Upload.findOne({
            _id: new Types.ObjectId(uploadId),
            userId: new Types.ObjectId(userId),
        });

        if (!upload) {
            throw new NotFoundException('Upload not found');
        }

        // Delete file from disk
        const uploadsDir = path.resolve(process.cwd(), 'uploads');
        const filePath = path.join(uploadsDir, upload.fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await Upload.deleteOne({ _id: upload._id });
    }
}

export const uploadService = new UploadService();
