import logger from '../../../config/logger';
import { PlatformAdapter, PlatformPublishResult } from './index';
import User from '../../Auth/user.schema';
import config from '../../../config';
import fs from 'fs';
import path from 'path';

/**
 * Helper function to retrieve a valid YouTube access token.
 * If expired or expiring within 60s, it uses the refresh token to get a new one and saves it.
 */
export async function getOrRefreshAccessToken(userId: string): Promise<string> {
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
        userId?: string,
        onProgress?: (progress: number) => void
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

            // Step 2: Upload Binary Video Data in Chunks
            const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (must be multiple of 262,144 bytes)
            let uploadedBytes = 0;
            let responseData: any = null;

            const fileStream = fs.createReadStream(videoPath, { highWaterMark: CHUNK_SIZE });

            for await (const chunk of fileStream) {
                const chunkLength = chunk.length;
                const startByte = uploadedBytes;
                const endByte = startByte + chunkLength - 1;
                const contentRange = `bytes ${startByte}-${endByte}/${fileSize}`;

                logger.info(`[YouTube Adapter] Uploading chunk: ${contentRange}`);

                const chunkResponse = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Length': chunkLength.toString(),
                        'Content-Range': contentRange,
                        'Content-Type': 'video/*'
                    },
                    body: chunk
                });

                if (!chunkResponse.ok && chunkResponse.status !== 308) {
                    const errText = await chunkResponse.text();
                    logger.error(`[YouTube Adapter] Video chunk upload failed: ${errText}`);
                    return { success: false, error: `Binary upload failed: ${errText}` };
                }

                uploadedBytes += chunkLength;
                const percentage = Math.round((uploadedBytes / fileSize) * 100);
                if (onProgress) {
                    try {
                        onProgress(percentage);
                    } catch (pErr: any) {
                        logger.error(`[YouTube Adapter] Progress callback error: ${pErr.message}`);
                    }
                }

                if (chunkResponse.status === 200 || chunkResponse.status === 201) {
                    responseData = await chunkResponse.json() as any;
                }
            }

            const videoId = responseData?.id;

            if (!videoId) {
                return { success: false, error: 'Upload finished but no YouTube Video ID was returned' };
            }

            // Upload Custom Thumbnail if present
            if (metadata.thumbnailUrl) {
                try {
                    const thumbnailFileName = path.basename(metadata.thumbnailUrl);
                    const thumbnailPath = path.resolve(process.cwd(), 'uploads', thumbnailFileName);

                    if (fs.existsSync(thumbnailPath)) {
                        logger.info(`[YouTube Adapter] Uploading custom thumbnail: ${thumbnailPath}`);
                        const thumbStats = fs.statSync(thumbnailPath);
                        const thumbBuffer = fs.readFileSync(thumbnailPath);

                        const ext = path.extname(thumbnailPath).toLowerCase();
                        const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

                        const thumbResponse = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': mimeType,
                                'Content-Length': thumbStats.size.toString()
                            },
                            body: thumbBuffer
                        });

                        if (!thumbResponse.ok) {
                            const thumbErr = await thumbResponse.text();
                            logger.error(`[YouTube Adapter] Failed to upload thumbnail to YouTube: ${thumbErr}`);
                        } else {
                            logger.info(`[YouTube Adapter] Custom thumbnail set successfully for video: ${videoId}`);
                        }
                    }
                } catch (thumbErr: any) {
                    logger.error(`[YouTube Adapter] Error during thumbnail upload: ${thumbErr.message}`);
                }
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
