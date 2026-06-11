import { Types } from 'mongoose';
import Content, { IContent } from './content.schema';
import Series from '../series/series.schema';
import { CreateContentInput, UpdateContentInput } from './content.z.schema';
import { NotFoundException, BadRequestException } from '../../shared/http-exception';

export class ContentService {
    /**
     * Create a new content item
     */
    async createContent(userId: string, data: CreateContentInput): Promise<IContent> {
        // Validate seriesId ownership if provided
        if (data.seriesId) {
            const seriesExists = await Series.exists({
                _id: new Types.ObjectId(data.seriesId),
                userId: new Types.ObjectId(userId),
                isDeleted: false,
            });
            if (!seriesExists) {
                throw new BadRequestException('Series not found or does not belong to you');
            }
        }

        const content = new Content({
            ...data,
            userId: new Types.ObjectId(userId),
            seriesId: data.seriesId ? new Types.ObjectId(data.seriesId) : null,
        });
        return await content.save();
    }

    /**
     * Get content by ID ensuring it belongs to the user
     */
    async getContentById(userId: string, contentId: string): Promise<IContent> {
        const content = await Content.findOne({
            _id: new Types.ObjectId(contentId),
            userId: new Types.ObjectId(userId),
        });

        if (!content) {
            throw new NotFoundException('Content not found');
        }

        return content;
    }

    /**
     * List user contents with pagination and filters
     */
    async listContent(userId: string, query: { page?: number; limit?: number; status?: string; platform?: string; seriesId?: string }) {
        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const filter: any = { userId: new Types.ObjectId(userId) };

        if (query.status) {
            filter.status = query.status;
        }

        if (query.platform) {
            filter.platform = query.platform;
        }

        if (query.seriesId) {
            filter.seriesId = new Types.ObjectId(query.seriesId);
        }

        const [data, total] = await Promise.all([
            Content.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Content.countDocuments(filter),
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
     * Update an existing content item
     */
    async updateContent(userId: string, contentId: string, data: UpdateContentInput): Promise<IContent> {
        // Validate seriesId ownership if provided
        if (data.seriesId) {
            const seriesExists = await Series.exists({
                _id: new Types.ObjectId(data.seriesId),
                userId: new Types.ObjectId(userId),
                isDeleted: false,
            });
            if (!seriesExists) {
                throw new BadRequestException('Series not found or does not belong to you');
            }
        }

        const updatePayload: any = { ...data };
        if (data.seriesId !== undefined) {
            updatePayload.seriesId = data.seriesId ? new Types.ObjectId(data.seriesId) : null;
        }

        const content = await Content.findOneAndUpdate(
            {
                _id: new Types.ObjectId(contentId),
                userId: new Types.ObjectId(userId),
            },
            { $set: updatePayload },
            { new: true, runValidators: true }
        );

        if (!content) {
            throw new NotFoundException('Content not found');
        }

        return content;
    }

    /**
     * Delete a content item
     */
    async deleteContent(userId: string, contentId: string): Promise<void> {
        const result = await Content.deleteOne({
            _id: new Types.ObjectId(contentId),
            userId: new Types.ObjectId(userId),
        });

        if (result.deletedCount === 0) {
            throw new NotFoundException('Content not found');
        }
    }
}

export const contentService = new ContentService();
