import logger from '../../../config/logger';
import { PlatformAdapter, PlatformPublishResult } from './index';
import User from '../../Auth/user.schema';
import config from '../../../config';
import fs from 'fs';

/**
 * Helper function to retrieve a valid YouTube access token.
 * If expired or expiring within 60s, it uses the refresh token to get a new one and saves it.
 */
async function getOrRefreshAccessToken(userId: string): Promise<string> {
    const user = await User.findById(userId);
    if (!user || !user.youtubeConnected) {
        throw new Error('YouTube account not connected for user');
    }

    const now = new Date();
    const expiry = user.youtubeTokenExpiry;

    // If token is still valid (not expired and not expiring in next 60s)
    if (expiry && expiry.getTime() > now.getTime() + 60 * 1000 && user.youtubeAccessToken) {
        return user.youtubeAccessToken;
    }

    logger.info(`YouTube access token expired or expiring soon. Refreshing for user: ${userId}`);
    if (!user.youtubeRefreshToken) {
        throw new Error('No YouTube refresh token available. Please re-authenticate.');
    }

    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: config.youtubeClientId,
            client_secret: config.youtubeClientSecret,
            refresh_token: user.youtubeRefreshToken,
            grant_type: 'refresh_token'
        })
    });

    if (!refreshResponse.ok) {
        const errText = await refreshResponse.text();
        throw new Error(`Failed to refresh YouTube access token: ${errText}`);
    }

    const tokenData = await refreshResponse.json() as any;
    const newAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;
    const newExpiryDate = new Date(Date.now() + expiresIn * 1000);

    user.youtubeAccessToken = newAccessToken;
    user.youtubeTokenExpiry = newExpiryDate;
    await user.save();

    logger.info(`Successfully refreshed YouTube access token for user: ${userId}`);
    return newAccessToken;
}

/**
 * YouTube / YouTube Shorts adapter.
 *
 * Real implementation - authenticates using user credentials and uploads video via Google API.
 */
export class YouTubeAdapter implements PlatformAdapter {
    platformName = 'YouTube';

    async publish(
        videoPath: string,
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string },
        userId?: string
    ): Promise<PlatformPublishResult> {
        if (!userId) {
            return { success: false, error: 'User ID is required for YouTube publishing' };
        }

        try {
            const accessToken = await getOrRefreshAccessToken(userId);

            logger.info(`[YouTube Adapter] Starting upload to YouTube for user: ${userId}`);
            logger.info(`  → Video: ${videoPath}`);
            logger.info(`  → Title: ${metadata.title}`);

            if (!fs.existsSync(videoPath)) {
                return { success: false, error: `Video file not found at path: ${videoPath}` };
            }

            const stats = fs.statSync(videoPath);
            const fileSize = stats.size;
            const videoBuffer = fs.readFileSync(videoPath);

            // Step 1: Initiate Resumable Upload
            const initiateResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Length': fileSize.toString(),
                    'X-Upload-Content-Type': 'video/*'
                },
                body: JSON.stringify({
                    snippet: {
                        title: metadata.title,
                        description: metadata.description,
                        tags: metadata.tags || []
                    },
                    status: {
                        privacyStatus: 'unlisted', // Upload as unlisted so user can review it on their YouTube Studio
                        selfDeclaredMadeForKids: false
                    }
                })
            });

            if (!initiateResponse.ok) {
                const errText = await initiateResponse.text();
                logger.error(`[YouTube Adapter] Failed to initiate upload: ${errText}`);
                return { success: false, error: `Initiate upload failed: ${errText}` };
            }

            const uploadUrl = initiateResponse.headers.get('Location');
            if (!uploadUrl) {
                return { success: false, error: 'Resumable upload Location header missing' };
            }

            logger.info(`[YouTube Adapter] Upload session initiated. Starting video data stream...`);

            // Step 2: Upload Binary Video Data
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Length': fileSize.toString(),
                    'Content-Type': 'video/*'
                },
                body: videoBuffer
            });

            if (!uploadResponse.ok) {
                const errText = await uploadResponse.text();
                logger.error(`[YouTube Adapter] Video chunk upload failed: ${errText}`);
                return { success: false, error: `Binary upload failed: ${errText}` };
            }

            const responseData = await uploadResponse.json() as any;
            const videoId = responseData.id;

            if (!videoId) {
                return { success: false, error: 'Upload finished but no YouTube Video ID was returned' };
            }

            const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
            logger.info(`[YouTube Adapter] ✅ Published successfully: ${watchUrl}`);

            return {
                success: true,
                liveUrl: watchUrl,
            };
        } catch (err: any) {
            logger.error(`[YouTube Adapter] Exception during publishing: ${err.message}`);
            return {
                success: false,
                error: err.message || 'Unknown exception in YouTube publisher'
            };
        }
    }
}
