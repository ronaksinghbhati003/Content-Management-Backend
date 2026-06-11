import logger from '../../../config/logger';
import { PlatformAdapter, PlatformPublishResult } from './index';

/**
 * Instagram Reels adapter.
 *
 * STUB IMPLEMENTATION — logs the publish action.
 * To enable real publishing:
 *   1. Create a Meta Developer App at https://developers.facebook.com
 *   2. Request instagram_content_publish permission
 *   3. Get a long-lived page access token
 *   4. Use the Instagram Graph API Container + Publish flow:
 *      POST /{ig-user-id}/media  → creates a container
 *      POST /{ig-user-id}/media_publish → publishes the container
 *
 * @see https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 */
export class InstagramAdapter implements PlatformAdapter {
    platformName = 'Instagram Reels';

    async publish(
        videoPath: string,
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string }
    ): Promise<PlatformPublishResult> {
        logger.info(`[Instagram Adapter] Publishing Reel...`);
        logger.info(`  → Video: ${videoPath}`);
        logger.info(`  → Cover Thumbnail: ${metadata.thumbnailUrl || 'None'}`);
        logger.info(`  → Caption: ${metadata.title}`);
        logger.info(`  → Hashtags: ${metadata.tags.map(t => `#${t}`).join(' ')}`);

        // ──────────────────────────────────────────────────────────
        // STUB: Simulate successful upload with a fake URL
        // ──────────────────────────────────────────────────────────
        await new Promise((resolve) => setTimeout(resolve, 800));

        const fakePostId = `ig_${Date.now().toString(36)}`;
        const fakeUrl = `https://www.instagram.com/reel/${fakePostId}/`;

        logger.info(`[Instagram Adapter] ✅ Reel published: ${fakeUrl}`);

        return {
            success: true,
            liveUrl: fakeUrl,
        };
    }
}
