import logger from '../../../config/logger';

/**
 * Platform adapter interface.
 * Each platform (YouTube, Instagram, TikTok) implements this interface.
 */
export interface PlatformPublishResult {
    success: boolean;
    liveUrl?: string;
    error?: string;
}

export interface PlatformAdapter {
    platformName: string;
    publish(videoPath: string, metadata: {
        title: string;
        description: string;
        tags: string[];
        thumbnailUrl?: string;
        visibility?: string; // "public" | "unlisted" | "private"
    }, userId?: string, onProgress?: (progress: number) => void): Promise<PlatformPublishResult>;
}

/**
 * Registry of all platform adapters
 */
import { YouTubeAdapter, YouTubeShortsAdapter } from './youtube.adapter';
import { InstagramAdapter, InstagramFeedAdapter } from './instagram.adapter';
import { TikTokAdapter } from './tiktok.adapter';

const adapters: Record<string, PlatformAdapter> = {
    youtube: new YouTubeAdapter(),
    youtube_shorts: new YouTubeShortsAdapter(),
    instagram_reels: new InstagramAdapter(),
    instagram_feed: new InstagramFeedAdapter(),
    tiktok: new TikTokAdapter(),
};

/**
 * Get a platform adapter by name
 */
export function getPlatformAdapter(platform: string): PlatformAdapter | null {
    const adapter = adapters[platform];
    if (!adapter) {
        logger.warn(`No adapter found for platform: ${platform}`);
        return null;
    }
    return adapter;
}

/**
 * Get all supported platform names
 */
export function getSupportedPlatforms(): string[] {
    return Object.keys(adapters);
}
