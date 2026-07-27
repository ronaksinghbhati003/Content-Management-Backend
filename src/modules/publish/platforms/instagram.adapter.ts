import path from 'path';
import fs from 'fs';
import logger from '../../../config/logger';
import { PlatformAdapter, PlatformPublishResult } from './index';
import User from '../../Auth/user.schema';
import config from '../../../config';

const GRAPH_API = 'https://graph.instagram.com/v21.0';
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 24; // 2 minutes max

/**
 * Returns a publicly reachable URL for the video file.
 * Tries the configured SERVER_BASE_URL first. If the tunnel is down or the URL
 * changed, falls back to uploading the file to file.io (free, 1 download, 24h).
 */
async function getPublicVideoUrl(videoPath: string): Promise<string> {
    const fileName   = path.basename(videoPath);
    const configUrl  = `${config.serverBaseUrl}/uploads/${fileName}`;

    // Try the configured tunnel/domain first
    try {
        const check = await fetch(configUrl, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
        if (check.ok) {
            logger.info(`[Instagram] ✓ Using configured URL: ${configUrl}`);
            return configUrl;
        }
        logger.warn(`[Instagram] Configured URL returned HTTP ${check.status} — falling back to file.io upload`);
    } catch (e: any) {
        logger.warn(`[Instagram] Configured URL unreachable (${e.message}) — falling back to file.io upload`);
    }

    // Fallback: upload to transfer.sh (free, multi-download, 14-day expiry)
    logger.info(`[Instagram] Uploading ${fileName} to transfer.sh...`);
    const fileBuffer = fs.readFileSync(videoPath);

    const uploadRes = await fetch(`https://transfer.sh/${encodeURIComponent(fileName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Max-Days': '3' },
        body: fileBuffer,
        signal: AbortSignal.timeout(180000), // 3 min timeout for large files
    });

    if (!uploadRes.ok) {
        const body = await uploadRes.text();
        throw new Error(
            `Cloudflare tunnel is down AND transfer.sh upload failed (HTTP ${uploadRes.status}). ` +
            `Start your tunnel: cloudflared tunnel --url http://localhost:${config.port || 3001} ` +
            `then update SERVER_BASE_URL in .env. transfer.sh response: ${body.slice(0, 100)}`
        );
    }

    const link = (await uploadRes.text()).trim();
    if (!link.startsWith('https://')) {
        throw new Error(`transfer.sh returned unexpected response: ${link.slice(0, 100)}`);
    }

    logger.info(`[Instagram] ✓ Uploaded to transfer.sh: ${link}`);
    return link;
}

async function getValidAccessToken(userId: string): Promise<{ token: string; igUserId: string }> {
    const user = await User.findById(userId);
    if (!user || !user.instagramConnected) {
        throw new Error('Instagram account not connected for this user');
    }
    if (!user.instagramAccessToken || !user.instagramUserId) {
        throw new Error('Instagram credentials missing. Please reconnect.');
    }
    // Long-lived tokens last 60 days — warn if expiring within 5 days
    if (user.instagramTokenExpiry) {
        const daysLeft = (user.instagramTokenExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysLeft < 5) {
            logger.warn(`[Instagram] Access token for user ${userId} expires in ${daysLeft.toFixed(1)} days. User should reconnect.`);
        }
    }
    return { token: user.instagramAccessToken, igUserId: user.instagramUserId };
}

async function pollContainerStatus(containerId: string, token: string): Promise<void> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

        const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status,error_message&access_token=${token}`);
        const raw = await res.text();
        let data: any;
        try { data = JSON.parse(raw); } catch {
            throw new Error(`Instagram status poll returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
        }

        logger.info(`[Instagram] Container ${containerId} status: ${data.status_code}`);

        if (data.status_code === 'FINISHED') return;
        if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
            const detail = data.error_message || data.status || 'No error detail returned by Instagram';
            logger.error(`[Instagram] Container failed — status_code: ${data.status_code}, error_message: ${detail}, full response: ${JSON.stringify(data)}`);
            throw new Error(`Instagram container processing failed: ${data.status_code} — ${detail}`);
        }
        // IN_PROGRESS or PUBLISHED → keep polling
    }
    throw new Error('Instagram container timed out after 2 minutes');
}

// Instagram's real, working post URLs use a shortcode (e.g. "DbND10TFMgr"),
// NOT the numeric media ID the publish call returns — a URL built as
// /reel/{numeric-id}/ looks plausible but 404s ("this page isn't available")
// even though the post itself published successfully. Fetch the real
// permalink from the Graph API instead of hand-constructing one. Never lets
// this extra lookup fail the publish itself — falls back to the old
// (best-effort, possibly-wrong) format if the permalink fetch has any issue.
async function fetchPermalink(mediaId: string, token: string, fallbackUrl: string): Promise<string> {
    try {
        const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${token}`);
        if (!res.ok) return fallbackUrl;
        const data: any = await res.json();
        return data.permalink || fallbackUrl;
    } catch (err: any) {
        logger.warn(`[Instagram] Failed to fetch real permalink for ${mediaId}, using fallback URL: ${err.message}`);
        return fallbackUrl;
    }
}

/**
 * Instagram adapter — supports Reels (video) and Feed posts (image).
 *
 * IMPORTANT: Instagram Graph API requires publicly accessible URLs for media.
 * In development set SERVER_BASE_URL to your ngrok/tunnel URL.
 * In production set SERVER_BASE_URL to your actual domain.
 */
export class InstagramAdapter implements PlatformAdapter {
    platformName = 'Instagram';

    async publish(
        videoPath: string,
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string },
        userId?: string,
        onProgress?: (progress: number) => void
    ): Promise<PlatformPublishResult> {
        if (!userId) {
            return { success: false, error: 'User ID is required for Instagram publishing' };
        }

        if (!config.metaAppId) {
            return { success: false, error: 'Meta App is not configured. Add META_APP_ID to .env' };
        }

        try {
            const { token, igUserId } = await getValidAccessToken(userId);

            const caption = this.buildCaption(metadata);
            logger.info(`[Instagram] Starting Reel upload for user ${userId}`);
            logger.info(`  → Caption length: ${caption.length}`);

            // Get a publicly reachable URL (tries tunnel first, then file.io fallback)
            const publicVideoUrl = await getPublicVideoUrl(videoPath);
            logger.info(`  → Public video URL: ${publicVideoUrl}`);

            if (onProgress) onProgress(10);

            // Step 1 — Create media container
            // share_to_feed: true  → Reel appears on profile grid AND Reels tab (required for it to go live)
            const containerBody: Record<string, string> = {
                media_type: 'REELS',
                video_url: publicVideoUrl,
                caption,
                share_to_feed: 'true',
                access_token: token,
            };
            if (metadata.thumbnailUrl) {
                // cover_url must be a publicly reachable image URL
                const isThumbUrl = metadata.thumbnailUrl.startsWith('http');
                const publicCoverUrl = isThumbUrl
                    ? metadata.thumbnailUrl
                    : `${config.serverBaseUrl}/uploads/${path.basename(metadata.thumbnailUrl)}`;
                containerBody.cover_url = publicCoverUrl;
                logger.info(`  → Cover URL: ${publicCoverUrl}`);
            }

            logger.info(`[Instagram] Creating media container with body: ${JSON.stringify({ ...containerBody, access_token: '***' })}`);
            // Instagram Graph API only accepts application/x-www-form-urlencoded (not JSON)
            const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(containerBody).toString(),
            });

            const containerRaw = await containerRes.text();
            logger.info(`[Instagram] Container response (HTTP ${containerRes.status}): ${containerRaw.slice(0, 500)}`);
            let containerData: any;
            try { containerData = JSON.parse(containerRaw); } catch {
                return { success: false, error: `Instagram API returned non-JSON (HTTP ${containerRes.status}): ${containerRaw.slice(0, 200)}` };
            }

            if (!containerRes.ok || !containerData.id) {
                const errMsg = containerData.error?.message || containerData.error?.error_user_msg || JSON.stringify(containerData);
                logger.error(`[Instagram] Container creation failed: ${errMsg}`);
                return { success: false, error: `Instagram container error: ${errMsg}` };
            }

            const containerId = containerData.id;
            logger.info(`[Instagram] Container created: ${containerId}. Polling for processing...`);
            if (onProgress) onProgress(30);

            // Step 2 — Poll until container is ready
            await pollContainerStatus(containerId, token);
            if (onProgress) onProgress(80);

            // Step 3 — Publish
            logger.info(`[Instagram] Publishing container ${containerId}...`);
            const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ creation_id: containerId, access_token: token }).toString(),
            });

            const publishRaw = await publishRes.text();
            logger.info(`[Instagram] Publish response (HTTP ${publishRes.status}): ${publishRaw.slice(0, 500)}`);
            let publishData: any;
            try { publishData = JSON.parse(publishRaw); } catch {
                return { success: false, error: `Instagram publish API returned non-JSON (HTTP ${publishRes.status}): ${publishRaw.slice(0, 200)}` };
            }

            if (!publishRes.ok || !publishData.id) {
                const errMsg = publishData.error?.message || publishData.error?.error_user_msg || JSON.stringify(publishData);
                logger.error(`[Instagram] Publish failed: ${errMsg}`);
                return { success: false, error: `Instagram publish error: ${errMsg}` };
            }

            const liveUrl = await fetchPermalink(publishData.id, token, `https://www.instagram.com/reel/${publishData.id}/`);
            if (onProgress) onProgress(100);
            logger.info(`[Instagram] ✅ Reel published: ${liveUrl}`);
            return { success: true, liveUrl };

        } catch (err: any) {
            logger.error(`[Instagram] Exception: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    private buildCaption(metadata: { title: string; description: string; tags: string[] }): string {
        const parts: string[] = [];
        if (metadata.title) parts.push(metadata.title);
        if (metadata.description) parts.push(metadata.description);
        if (metadata.tags?.length) {
            parts.push(metadata.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' '));
        }
        return parts.join('\n\n').slice(0, 2200); // Instagram caption limit
    }
}

/**
 * Instagram Feed adapter — publishes a single image as a feed post.
 * Uses thumbnailUrl as the image source.
 */
export class InstagramFeedAdapter implements PlatformAdapter {
    platformName = 'Instagram Feed';

    async publish(
        videoPath: string,
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string },
        userId?: string,
        onProgress?: (progress: number) => void
    ): Promise<PlatformPublishResult> {
        if (!userId) {
            return { success: false, error: 'User ID is required for Instagram publishing' };
        }

        if (!config.metaAppId) {
            return { success: false, error: 'Meta App is not configured. Add META_APP_ID to .env' };
        }

        if (!metadata.thumbnailUrl) {
            return { success: false, error: 'An image (thumbnail) is required for Instagram feed posts' };
        }

        try {
            const { token, igUserId } = await getValidAccessToken(userId);
            const caption = this.buildCaption(metadata);

            logger.info(`[Instagram Feed] Starting image post for user ${userId}`);
            if (onProgress) onProgress(10);

            // Step 1 — Create image container (form-encoded — Instagram Graph API doesn't accept JSON)
            const containerRes = await fetch(`${GRAPH_API}/${igUserId}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ image_url: metadata.thumbnailUrl, caption, access_token: token }).toString(),
            });

            const containerRaw = await containerRes.text();
            let containerData: any;
            try { containerData = JSON.parse(containerRaw); } catch {
                return { success: false, error: `Instagram API returned non-JSON (HTTP ${containerRes.status}): ${containerRaw.slice(0, 200)}` };
            }
            if (!containerRes.ok || !containerData.id) {
                return { success: false, error: containerData.error?.message || 'Failed to create Instagram image container' };
            }

            if (onProgress) onProgress(60);

            // Step 2 — Publish (images don't need polling)
            const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ creation_id: containerData.id, access_token: token }).toString(),
            });

            const publishRaw = await publishRes.text();
            let publishData: any;
            try { publishData = JSON.parse(publishRaw); } catch {
                return { success: false, error: `Instagram publish API returned non-JSON (HTTP ${publishRes.status}): ${publishRaw.slice(0, 200)}` };
            }
            if (!publishRes.ok || !publishData.id) {
                return { success: false, error: publishData.error?.message || 'Failed to publish Instagram post' };
            }

            const liveUrl = await fetchPermalink(publishData.id, token, `https://www.instagram.com/p/${publishData.id}/`);
            if (onProgress) onProgress(100);
            logger.info(`[Instagram Feed] ✅ Post published: ${liveUrl}`);
            return { success: true, liveUrl };

        } catch (err: any) {
            logger.error(`[Instagram Feed] Exception: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    private buildCaption(metadata: { title: string; description: string; tags: string[] }): string {
        const parts: string[] = [];
        if (metadata.title) parts.push(metadata.title);
        if (metadata.description) parts.push(metadata.description);
        if (metadata.tags?.length) {
            parts.push(metadata.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' '));
        }
        return parts.join('\n\n').slice(0, 2200);
    }
}
