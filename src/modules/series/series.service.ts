import { Types } from 'mongoose';
import Series, { ISeries } from './series.schema';
import Content, { IContent } from '../content/content.schema';
import { CreateSeriesInput, UpdateSeriesInput } from './series.z.schema';
import { NotFoundException } from '../../shared/http-exception';

export class SeriesService {
    /**
     * Create a new series (playlist)
     */
    async createSeries(userId: string, data: CreateSeriesInput): Promise<ISeries> {
        const series = new Series({
            ...data,
            userId: new Types.ObjectId(userId),
        });
        return await series.save();
    }

    /**
     * Get a single series by ID — must belong to the requesting user
     */
    async getSeriesById(userId: string, seriesId: string): Promise<ISeries> {
        const series = await Series.findOne({
            _id: new Types.ObjectId(seriesId),
            userId: new Types.ObjectId(userId),
            isDeleted: false,
        });

        if (!series) {
            throw new NotFoundException('Series not found');
        }

        return series;
    }

    /**
     * List all series for a user with pagination and optional filters
     */
    async listSeries(
        userId: string,
        query: { page?: number; limit?: number; status?: string; platform?: string }
    ) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 1000;
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = {
            userId: new Types.ObjectId(userId),
            isDeleted: false,
        };

        if (query.status) filter.status = query.status;
        if (query.platform) filter.platform = { $in: [query.platform] };

        const [data, total] = await Promise.all([
            Series.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Series.countDocuments(filter),
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
     * Update a series — only the owner can update
     */
    async updateSeries(userId: string, seriesId: string, data: UpdateSeriesInput): Promise<ISeries> {
        const series = await Series.findOneAndUpdate(
            {
                _id: new Types.ObjectId(seriesId),
                userId: new Types.ObjectId(userId),
                isDeleted: false,
            },
            { $set: data },
            { new: true, runValidators: true }
        );

        if (!series) {
            throw new NotFoundException('Series not found');
        }

        return series;
    }

    /**
     * Hard-delete a series by ID
     */
    async deleteSeries(userId: string, seriesId: string): Promise<void> {
        const result = await Series.deleteOne({
            _id: new Types.ObjectId(seriesId),
            userId: new Types.ObjectId(userId),
        });

        if (result.deletedCount === 0) {
            throw new NotFoundException('Series not found');
        }
    }

    /**
     * Get all content items that belong to a specific series (paginated)
     * Validates series ownership before querying content
     */
    async getSeriesContents(
        userId: string,
        seriesId: string,
        query: { page?: number; limit?: number }
    ): Promise<{ data: IContent[]; meta: Record<string, unknown> }> {
        // Ensure the series exists and belongs to this user
        const seriesExists = await Series.exists({
            _id: new Types.ObjectId(seriesId),
            userId: new Types.ObjectId(userId),
            isDeleted: false,
        });

        if (!seriesExists) {
            throw new NotFoundException('Series not found');
        }

        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 1000;
        const skip = (page - 1) * limit;

        const filter = {
            seriesId: new Types.ObjectId(seriesId),
            userId: new Types.ObjectId(userId),
            isDeleted: false,
        };

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
}

export const seriesService = new SeriesService();
