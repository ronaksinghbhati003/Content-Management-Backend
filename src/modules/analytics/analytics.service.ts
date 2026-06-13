import User from '../Auth/user.schema';
import logger from '../../config/logger';
import { getOrRefreshAccessToken } from '../publish/platforms/youtube.adapter';

export class AnalyticsService {
    /**
     * Retrieve channel stats from YouTube API and build analytics dashboard payload.
     */
    async getAnalytics(userId: string) {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        let youtubeStats = {
            viewCount: 0,
            subscriberCount: 0,
            videoCount: 0,
            connected: false
        };

        if (user.youtubeConnected) {
            try {
                const accessToken = await getOrRefreshAccessToken(userId);
                
                // Fetch channel statistics from YouTube Data API
                const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });

                if (channelResponse.ok) {
                    const channelData = await channelResponse.json() as any;
                    const channelItem = channelData.items?.[0];
                    if (channelItem) {
                        const subscriberCount = Number(channelItem.statistics?.subscriberCount || 0);
                        const viewCount = Number(channelItem.statistics?.viewCount || 0);
                        const videoCount = Number(channelItem.statistics?.videoCount || 0);

                        youtubeStats = {
                            viewCount,
                            subscriberCount,
                            videoCount,
                            connected: true
                        };

                        // Sync retrieved channel details back to MongoDB
                        user.youtubeSubscriberCount = subscriberCount;
                        user.youtubeChannelName = channelItem.snippet.title;
                        user.youtubeChannelHandle = channelItem.snippet.customUrl || '';
                        user.youtubeChannelIcon = channelItem.snippet.thumbnails?.default?.url || '';
                        user.youtubeLastSync = new Date();
                        await user.save();
                    }
                } else {
                    const errText = await channelResponse.text();
                    logger.error(`[Analytics Service] Failed to fetch channel stats: ${errText}`);
                    
                    // Fallback to database cached stats
                    youtubeStats = {
                        viewCount: 0,
                        subscriberCount: user.youtubeSubscriberCount || 0,
                        videoCount: 0,
                        connected: true
                    };
                }
            } catch (err: any) {
                logger.error(`[Analytics Service] Error updating YouTube stats: ${err.message}`);
                
                // Fallback to database cached stats
                youtubeStats = {
                    viewCount: 0,
                    subscriberCount: user.youtubeSubscriberCount || 0,
                    videoCount: 0,
                    connected: true
                };
            }
        }

        // Helper to format numbers cleanly (e.g. 1500000 -> 1.5M, 1500 -> 1.5K)
        const formatNumber = (num: number): string => {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
            }
            if (num >= 1000) {
                return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
            }
            return num.toString();
        };

        const connectedCount = user.youtubeConnected ? 1 : 0;

        const stats = [
            {
                name: 'Total Views',
                iconKey: 'Play',
                value: user.youtubeConnected ? formatNumber(youtubeStats.viewCount) : '2.4M',
                change: user.youtubeConnected ? '+0%' : '+12%',
            },
            {
                name: 'Subscribers',
                iconKey: 'Users',
                value: user.youtubeConnected ? formatNumber(youtubeStats.subscriberCount) : '84.2K',
                change: user.youtubeConnected ? '+0' : '+840',
            },
            {
                name: 'Avg Watch Time',
                iconKey: 'Clock',
                value: '4m 32s',
                change: '+5%',
            },
            {
                name: 'Revenue',
                iconKey: 'TrendingUp',
                value: '$12.4K',
                change: '+15%',
            },
        ];

        const aiSuggestions = [
            {
                id: 'sug-1',
                iconKey: 'Zap',
                impact: 'Critical',
                confidence: 94,
                title: 'Shorts Strategy',
                description: user.youtubeConnected
                    ? `Your channel ${user.youtubeChannelName || ''} is connected! Focus on publishing 3 new Shorts on kettlebell training this week.`
                    : 'Connect your YouTube account in settings to receive tailored video strategy suggestions based on your target audience.',
                action: 'Draft Script',
            },
            {
                id: 'sug-2',
                iconKey: 'Clock',
                impact: 'High',
                confidence: 88,
                title: 'Posting Times',
                description: 'Your Instagram audience is most active on Sundays at 4:00 PM. Reschedule your upcoming post to maximize reach.',
                action: 'Reschedule',
            },
            {
                id: 'sug-3',
                iconKey: 'Sparkles',
                impact: 'Medium',
                confidence: 82,
                title: 'Thumbnail Optimization',
                description: "Re-generate the thumbnail for 'Morning Habits for Productivity' using brighter colors to improve click-through rate.",
                action: 'Generate New',
            },
        ];

        return {
            stats,
            aiSuggestions,
            connectedCount,
            roadmap: [
                { title: 'Gym Motivation Series', due: 'June 15', status: 'Scheduled', color: 'bg-emerald-500' },
                { title: 'Morning Productivity Hacks', due: 'June 18', status: 'In Progress', color: 'bg-amber-500' },
                { title: 'Kettlebell Workout for Beginners', due: 'June 20', status: 'Draft', color: 'bg-indigo-500' },
            ],
            platformPerformance: [],
        };
    }
}

export const analyticsService = new AnalyticsService();
