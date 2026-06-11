import logger from '../../../config/logger';
import { PlatformAdapter, PlatformPublishResult } from './index';

/**
 * TikTok adapter.
 *
 * STUB IMPLEMENTATION — logs the publish action.
 * To enable real publishing:
 *   1. Register at https://developers.tiktok.com
 *   2. Create an app and request video.publish scope
 *   3. Use the Content Posting API:
 *      POST /v2/post/publish/inbox/video/init → init upload
 *      PUT chunk upload
 *      POST /v2/post/publish/status/fetch → check status
 *
 * @see https://developers.tiktok.com/doc/content-posting-api-get-started
 */
export class TikTokAdapter implements PlatformAdapter {
    platformName = 'TikTok';

    async publish(
        videoPath: string,
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string }
    ): Promise<PlatformPublishResult> {
        logger.info(`[TikTok Adapter] Publishing video...`);
        logger.info(`  → Video: ${videoPath}`);
        logger.info(`  → Cover Thumbnail: ${metadata.thumbnailUrl || 'None'}`);
        logger.info(`  → Caption: ${metadata.description}`);
        logger.info(`  → Hashtags: ${metadata.tags.map(t => `#${t}`).join(' ')}`);

        // ──────────────────────────────────────────────────────────
        // STUB: Simulate successful upload with a fake URL
        // ──────────────────────────────────────────────────────────
        await new Promise((resolve) => setTimeout(resolve, 600));

        const fakeVideoId = `tt_${Date.now().toString(36)}`;
        const fakeUrl = `https://www.tiktok.com/@creator/video/${fakeVideoId}`;

        logger.info(`[TikTok Adapter] ✅ Video published: ${fakeUrl}`);

        return {
            success: true,
            liveUrl: fakeUrl,
        };
    }
}
