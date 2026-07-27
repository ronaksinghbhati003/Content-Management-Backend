import logger from '../../../config/logger';
import { PlatformAdapter, PlatformPublishResult } from './index';
import User from '../../Auth/user.schema';
import config from '../../../config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

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
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string; visibility?: string },
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
                        privacyStatus: (metadata.visibility || 'public') as 'public' | 'unlisted' | 'private',
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
            // YouTube enforces a hard 2 MB limit. We use sharp to compress if needed.
            const YOUTUBE_THUMB_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
            if (metadata.thumbnailUrl) {
                try {
                    let thumbBuffer: Buffer;
                    const isUrl = metadata.thumbnailUrl.startsWith('http://') || metadata.thumbnailUrl.startsWith('https://');

                    if (isUrl) {
                        // Download thumbnail from URL (e.g. img.youtube.com or any CDN)
                        logger.info(`[YouTube Adapter] Downloading thumbnail from URL: ${metadata.thumbnailUrl}`);
                        const dlRes = await fetch(metadata.thumbnailUrl);
                        if (!dlRes.ok) {
                            logger.warn(`[YouTube Adapter] Could not download thumbnail (${dlRes.status}) — skipping`);
                            thumbBuffer = null as any;
                        } else {
                            thumbBuffer = Buffer.from(await dlRes.arrayBuffer());
                        }
                    } else {
                        // Legacy: local file path
                        const thumbnailPath = path.resolve(process.cwd(), 'uploads', path.basename(metadata.thumbnailUrl));
                        if (!fs.existsSync(thumbnailPath)) {
                            logger.warn(`[YouTube Adapter] Thumbnail file not found locally: ${thumbnailPath}`);
                            thumbBuffer = null as any;
                        } else {
                            thumbBuffer = fs.readFileSync(thumbnailPath);
                        }
                    }

                    if (thumbBuffer) {
                        // Compress if over 2 MB
                        if (thumbBuffer.length > YOUTUBE_THUMB_MAX_BYTES) {
                            logger.info(`[YouTube Adapter] Thumbnail ${(thumbBuffer.length / 1024 / 1024).toFixed(2)} MB — compressing...`);
                            let quality = 85;
                            do {
                                thumbBuffer = await sharp(thumbBuffer)
                                    .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
                                    .jpeg({ quality })
                                    .toBuffer();
                                quality -= 10;
                            } while (thumbBuffer.length > YOUTUBE_THUMB_MAX_BYTES && quality > 10);
                            logger.info(`[YouTube Adapter] Compressed to ${(thumbBuffer.length / 1024).toFixed(0)} KB`);
                        }

                        logger.info(`[YouTube Adapter] Uploading thumbnail to YouTube for video: ${videoId}`);
                        const thumbResponse = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'image/jpeg',
                                'Content-Length': thumbBuffer.length.toString()
                            },
                            body: thumbBuffer
                        });

                        if (!thumbResponse.ok) {
                            const thumbErr = await thumbResponse.text();
                            logger.error(`[YouTube Adapter] Failed to upload thumbnail: ${thumbErr}`);
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

/**
 * YouTube Shorts adapter.
 * Identical to YouTubeAdapter but appends #Shorts to the description so
 * YouTube automatically classifies the upload as a Short.
 * Uses the same OAuth credentials and tokens as the main YouTube connection.
 */
export class YouTubeShortsAdapter extends YouTubeAdapter {
    platformName = 'YouTube Shorts';

    async publish(
        videoPath: string,
        metadata: { title: string; description: string; tags: string[]; thumbnailUrl?: string; visibility?: string },
        userId?: string,
        onProgress?: (progress: number) => void
    ): Promise<PlatformPublishResult> {
        const shortsMetadata = {
            ...metadata,
            description: metadata.description
                ? `${metadata.description}\n\n#Shorts`
                : '#Shorts',
            tags: [...(metadata.tags || []), 'Shorts'],
        };

        logger.info(`[YouTube Shorts Adapter] Delegating to YouTube upload with #Shorts tag`);
        const result = await super.publish(videoPath, shortsMetadata, userId, onProgress);

        if (result.success && result.liveUrl) {
            // YouTube Shorts URL format
            const videoId = result.liveUrl.split('v=')[1];
            return {
                ...result,
                liveUrl: `https://www.youtube.com/shorts/${videoId}`,
            };
        }

        return result;
    }
}
