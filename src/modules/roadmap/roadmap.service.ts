import { Types } from 'mongoose';
import RoadmapItem, { IRoadmapItem } from './roadmap.schema';
import { CreateRoadmapItemInput, UpdateRoadmapItemInput } from './roadmap.z.schema';
import { NotFoundException } from '../../shared/http-exception';

// Seeded into a brand-new user's board on their first visit to the Roadmap
// page, so it isn't empty on day one — mirrors the sample cards the UI used
// to render from local mock data before this module existed. Persisted like
// any other item afterwards, so demo edits (drag, checklist, notes) stick.
const DEFAULT_ROADMAP_ITEMS = [
    { title: 'AI SaaS Idea', status: 'Brainstorming', tags: ['AI', 'SaaS'], due: 'Apr 25', priority: 'High', progress: 0, checklist: [], notes: '', platforms: ['YouTube', 'Twitter'], activity: [{ id: 1, text: 'Created idea', date: '2 days ago' }] },
    { title: 'Q&A Session', status: 'Brainstorming', tags: ['Community'], due: 'Apr 28', priority: 'Medium', progress: 20, checklist: [{ id: 1, text: 'Collect questions', done: true }, { id: 2, text: 'Draft answers', done: false }], notes: 'Keep it under 10 mins.', platforms: ['YouTube'], activity: [{ id: 1, text: 'Moved to Brainstorming', date: '1 day ago' }] },
    { title: 'Office Setup V2', status: 'Brainstorming', tags: ['Vlog'], due: 'May 2', priority: 'Low', progress: 0, checklist: [], notes: '', platforms: ['YouTube', 'Instagram'], activity: [{ id: 1, text: 'Added to backlog', date: '1 week ago' }] },
    { title: 'Next.js 16 Deep Dive', status: 'Scripting', tags: ['Tech'], due: 'Apr 24', priority: 'High', progress: 40, checklist: [{ id: 1, text: 'Outline', done: true }, { id: 2, text: 'First draft', done: false }], notes: 'Highlight routing changes.', platforms: ['YouTube'], activity: [{ id: 1, text: 'Moved to Scripting', date: '3 hours ago' }] },
    { title: 'Tailwind 4 vs 3', status: 'Scripting', tags: ['Design'], due: 'Apr 26', priority: 'Medium', progress: 60, checklist: [{ id: 1, text: 'Research features', done: true }, { id: 2, text: 'Code examples', done: false }], notes: '', platforms: ['YouTube', 'Twitter'], activity: [{ id: 1, text: 'Checklist updated', date: '4 hours ago' }] },
    { title: 'State of React 2026', status: 'Production', tags: ['Trends'], due: 'Apr 30', priority: 'Urgent', progress: 85, checklist: [{ id: 1, text: 'Record A-roll', done: true }, { id: 2, text: 'Record screen capture', done: true }, { id: 3, text: 'Audio sync', done: false }], notes: 'Use the new mic.', platforms: ['YouTube', 'TikTok'], activity: [{ id: 1, text: 'Moved to Production', date: 'Yesterday' }] },
    { title: 'Editor Vlog #12', status: 'Post-Production', tags: ['Behind the scenes'], due: 'May 5', priority: 'Low', progress: 95, checklist: [{ id: 1, text: 'Color grade', done: true }, { id: 2, text: 'Export', done: false }], notes: '', platforms: ['Instagram', 'TikTok'], activity: [{ id: 1, text: 'Moved to Post-Production', date: 'Just now' }] },
];

export class RoadmapService {
    /**
     * Create a new roadmap item
     */
    async createRoadmapItem(userId: string, data: CreateRoadmapItemInput): Promise<IRoadmapItem> {
        const item = new RoadmapItem({
            ...data,
            userId: new Types.ObjectId(userId),
        });
        return await item.save();
    }

    /**
     * Get a roadmap item by ID ensuring it belongs to the user
     */
    async getRoadmapItemById(userId: string, itemId: string): Promise<IRoadmapItem> {
        const item = await RoadmapItem.findOne({
            _id: new Types.ObjectId(itemId),
            userId: new Types.ObjectId(userId),
        });

        if (!item) {
            throw new NotFoundException('Roadmap item not found');
        }

        return item;
    }

    /**
     * List all roadmap items for a user, seeding sample cards on first visit
     * so a brand-new board isn't empty.
     */
    async listRoadmapItems(userId: string, query: { status?: string }): Promise<IRoadmapItem[]> {
        const userObjectId = new Types.ObjectId(userId);
        const existingCount = await RoadmapItem.countDocuments({ userId: userObjectId });

        if (existingCount === 0) {
            await RoadmapItem.insertMany(
                DEFAULT_ROADMAP_ITEMS.map((item) => ({ ...item, userId: userObjectId }))
            );
        }

        const filter: any = { userId: userObjectId };
        if (query.status) {
            filter.status = query.status;
        }

        return await RoadmapItem.find(filter).sort({ createdAt: -1 });
    }

    /**
     * Update an existing roadmap item
     */
    async updateRoadmapItem(userId: string, itemId: string, data: UpdateRoadmapItemInput): Promise<IRoadmapItem> {
        const item = await RoadmapItem.findOneAndUpdate(
            {
                _id: new Types.ObjectId(itemId),
                userId: new Types.ObjectId(userId),
            },
            { $set: data },
            { new: true, runValidators: true }
        );

        if (!item) {
            throw new NotFoundException('Roadmap item not found');
        }

        return item;
    }

    /**
     * Delete a roadmap item
     */
    async deleteRoadmapItem(userId: string, itemId: string): Promise<void> {
        const result = await RoadmapItem.deleteOne({
            _id: new Types.ObjectId(itemId),
            userId: new Types.ObjectId(userId),
        });

        if (result.deletedCount === 0) {
            throw new NotFoundException('Roadmap item not found');
        }
    }
}

export const roadmapService = new RoadmapService();
