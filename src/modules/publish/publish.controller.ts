import { Request, Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { PublishService } from './publish.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import config from '../../config';
import User from '../Auth/user.schema';
import logger from '../../config/logger';

export class PublishController {
    constructor(private readonly publishService: PublishService) {}

    /**
     * @route POST /api/v1/publish/create
     * @desc Create a new publish job
     */
    create = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const job = await this.publishService.createPublishJob(userId, req.body);
        res.status(201).json(ApiResponse.created(job, 'Publish job created successfully'));
    });

    /**
     * @route GET /api/v1/publish/list
     * @desc List all publish jobs for the user
     */
    list = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const { page, limit, status, contentId } = req.query as any;
        const result = await this.publishService.listPublishJobs(userId, { page, limit, status, contentId });
        res.status(200).json(ApiResponse.ok(result.data, 'Publish jobs fetched successfully', 200, result.meta));
    });

    /**
     * @route GET /api/v1/publish/:id
     * @desc Get a single publish job
     */
    getById = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const job = await this.publishService.getPublishJobById(userId, id);
        res.status(200).json(ApiResponse.ok(job, 'Publish job fetched successfully'));
    });

    /**
     * @route DELETE /api/v1/publish/:id
     * @desc Cancel a scheduled publish job
     */
    cancel = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const job = await this.publishService.cancelPublishJob(userId, id);
        res.status(200).json(ApiResponse.ok(job, 'Publish job cancelled'));
    });

    /**
     * @route POST /api/v1/publish/:id/retry
     * @desc Retry a failed publish job
     */
    retry = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const id = req.params.id as string;
        const job = await this.publishService.retryPublishJob(userId, id);
        res.status(200).json(ApiResponse.ok(job, 'Publish job queued for retry'));
    });

    /**
     * @route GET /api/v1/publish/youtube/connect
     * @desc Get YouTube OAuth2 authorization link
     */
    connectYouTube = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const clientId = config.youtubeClientId;
        const redirectUri = config.youtubeRedirectUri;

        if (!clientId || !config.youtubeClientSecret) {
            logger.error('YouTube Client ID or Client Secret not configured in .env');
            res.status(400).json(ApiResponse.error(400, 'YouTube integration is not configured. Please contact support or set environment variables.'));
            return;
        }

        const scopes = [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
        ].join(' ');

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&state=${encodeURIComponent(userId)}`;

        res.status(200).json(ApiResponse.ok({ authUrl }, 'Authorization URL generated successfully'));
    });

    /**
     * @route GET /api/v1/publish/youtube/callback
     * @desc Handle Google OAuth2 redirect callback
     */
    youtubeCallback = asyncHandler(async (req: Request, res: Response) => {
        const { code, state: userId, error } = req.query;

        if (error) {
            logger.error(`YouTube OAuth error callback: ${error}`);
            return res.redirect(`http://localhost:3000/settings?error=youtube_auth_cancelled`);
        }

        if (!code || !userId) {
            return res.redirect(`http://localhost:3000/settings?error=invalid_callback_params`);
        }

        try {
            // Exchange auth code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    code: code as string,
                    client_id: config.youtubeClientId,
                    client_secret: config.youtubeClientSecret,
                    redirect_uri: config.youtubeRedirectUri,
                    grant_type: 'authorization_code'
                })
            });

            if (!tokenResponse.ok) {
                const errText = await tokenResponse.text();
                logger.error(`Failed to exchange auth code: ${errText}`);
                return res.redirect(`http://localhost:3000/settings?error=token_exchange_failed`);
            }

            const tokens = await tokenResponse.json() as any;
            const accessToken = tokens.access_token;
            const refreshToken = tokens.refresh_token;
            const expiresIn = tokens.expires_in;
            const expiryDate = new Date(Date.now() + expiresIn * 1000);

            // Fetch channel details from YouTube API
            const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!channelResponse.ok) {
                const errText = await channelResponse.text();
                logger.error(`Failed to fetch YouTube channel details: ${errText}`);
                return res.redirect(`http://localhost:3000/settings?error=channel_fetch_failed`);
            }

            const channelData = await channelResponse.json() as any;
            const channelItem = channelData.items?.[0];

            if (!channelItem) {
                logger.error(`No YouTube channel found for authorized account`);
                return res.redirect(`http://localhost:3000/settings?error=no_channel_found`);
            }

            const channelId = channelItem.id;
            const channelName = channelItem.snippet.title;
            const channelHandle = channelItem.snippet.customUrl || '';
            const channelIcon = channelItem.snippet.thumbnails?.default?.url || '';
            const subscriberCount = Number(channelItem.statistics?.subscriberCount || 0);

            // Find user and save tokens
            const user = await User.findById(userId);
            if (!user) {
                logger.error(`User not found for ID: ${userId}`);
                return res.redirect(`http://localhost:3000/settings?error=user_not_found`);
            }

            user.youtubeConnected = true;
            user.youtubeAccessToken = accessToken;
            if (refreshToken) {
                user.youtubeRefreshToken = refreshToken;
            }
            user.youtubeTokenExpiry = expiryDate;
            user.youtubeChannelId = channelId;
            user.youtubeChannelName = channelName;
            user.youtubeChannelHandle = channelHandle;
            user.youtubeChannelIcon = channelIcon;
            user.youtubeSubscriberCount = subscriberCount;
            user.youtubeLastSync = new Date();

            await user.save();
            logger.info(`Successfully connected YouTube channel ${channelName} for user ${userId}`);

            res.redirect(`http://localhost:3000/settings?success=youtube_connected`);
        } catch (err: any) {
            logger.error(`Error in YouTube OAuth callback handler: ${err.message}`);
            res.redirect(`http://localhost:3000/settings?error=internal_oauth_error`);
        }
    });

    /**
     * @route GET /api/v1/publish/youtube/status
     * @desc Get current user's YouTube connection status
     */
    youtubeStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const user = await User.findById(userId);

        if (!user || !user.youtubeConnected) {
            res.status(200).json(ApiResponse.ok({ connected: false }, 'YouTube is not connected'));
            return;
        }

        res.status(200).json(ApiResponse.ok({
            connected: true,
            channelName: user.youtubeChannelName,
            handle: user.youtubeChannelHandle,
            icon: user.youtubeChannelIcon,
            subscribers: user.youtubeSubscriberCount,
            lastSync: user.youtubeLastSync
        }, 'YouTube connection details retrieved successfully'));
    });

    /**
     * @route POST /api/v1/publish/youtube/disconnect
     * @desc Disconnect YouTube channel
     */
    disconnectYouTube = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const user = await User.findById(userId);

        if (user) {
            user.youtubeConnected = false;
            user.youtubeAccessToken = undefined as any;
            user.youtubeRefreshToken = undefined as any;
            user.youtubeTokenExpiry = undefined as any;
            user.youtubeChannelId = undefined as any;
            user.youtubeChannelName = undefined as any;
            user.youtubeChannelHandle = undefined as any;
            user.youtubeChannelIcon = undefined as any;
            user.youtubeSubscriberCount = 0;
            user.youtubeLastSync = undefined as any;
            await user.save();
        }

        res.status(200).json(ApiResponse.ok(null, 'YouTube disconnected successfully'));
    });

    // ── Instagram OAuth ──────────────────────────────────────────────────────

    /**
     * @route GET /api/v1/publish/instagram/connect
     */
    connectInstagram = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;

        if (!config.instagramAppId || !config.instagramAppSecret) {
            res.status(400).json(ApiResponse.error(400, 'Instagram integration is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in .env'));
            return;
        }

        const scopes = 'instagram_business_basic,instagram_business_content_publish';

        const authUrl = `https://www.instagram.com/oauth/authorize?` +
            `force_reauth=true` +
            `&client_id=${encodeURIComponent(config.instagramAppId)}` +
            `&redirect_uri=${encodeURIComponent(config.metaRedirectUri)}` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&response_type=code` +
            `&state=${encodeURIComponent(userId)}`;

        res.status(200).json(ApiResponse.ok({ authUrl }, 'Instagram authorization URL generated'));
    });

    /**
     * @route GET /api/v1/publish/instagram/callback
     */
    instagramCallback = asyncHandler(async (req: Request, res: Response) => {
        const { code, state: userId, error } = req.query;

        if (error) {
            return res.redirect(`http://localhost:3000/settings?error=instagram_auth_cancelled`);
        }
        if (!code || !userId) {
            return res.redirect(`http://localhost:3000/settings?error=invalid_instagram_callback`);
        }

        try {
            // Step 1 — Exchange code for short-lived token (Instagram Business Login)
            const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: config.instagramAppId,
                    client_secret: config.instagramAppSecret,
                    grant_type: 'authorization_code',
                    redirect_uri: config.metaRedirectUri,
                    code: code as string,
                }),
            });
            const tokenData = await tokenRes.json() as any;
            if (!tokenRes.ok || !tokenData.access_token) {
                logger.error(`[Instagram OAuth] Token exchange failed: ${JSON.stringify(tokenData)}`);
                return res.redirect(`http://localhost:3000/settings?error=instagram_token_exchange_failed`);
            }
            const shortToken = tokenData.access_token;
            logger.info(`[Instagram OAuth] Short-lived token user_id: ${tokenData.user_id}`);

            // Step 2 — Exchange for long-lived token (60 days)
            const longTokenRes = await fetch(
                `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
                `&client_id=${config.instagramAppId}` +
                `&client_secret=${config.instagramAppSecret}` +
                `&access_token=${shortToken}`
            );
            const longTokenData = await longTokenRes.json() as any;
            const longToken = longTokenData.access_token || shortToken;
            const expiresIn = longTokenData.expires_in || 60 * 24 * 60 * 60;
            const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
            logger.info(`[Instagram OAuth] Long-lived token exchange: ${JSON.stringify(longTokenData)}`);

            // Step 3 — Get Instagram user info directly
            const userRes = await fetch(
                `https://graph.instagram.com/me?fields=id,name,username,profile_picture_url,followers_count&access_token=${longToken}`
            );
            const userData = await userRes.json() as any;
            logger.info(`[Instagram OAuth] /me response: ${JSON.stringify(userData)}`);

            const igUserId = String(userData.id || tokenData.user_id);
            const igName = userData.name || '';
            const igHandle = userData.username ? `@${userData.username}` : '';
            const igIcon = userData.profile_picture_url || '';
            const igFollowers = userData.followers_count || 0;

            // Step 4 — Save to user
            const user = await User.findById(userId);
            if (!user) {
                return res.redirect(`http://localhost:3000/settings?error=user_not_found`);
            }

            user.instagramConnected = true;
            user.instagramAccessToken = longToken;
            user.instagramTokenExpiry = tokenExpiry;
            user.instagramUserId = igUserId;
            user.instagramAccountName = igName;
            user.instagramAccountHandle = igHandle;
            user.instagramAccountIcon = igIcon;
            user.instagramFollowerCount = igFollowers;
            user.instagramLastSync = new Date();
            await user.save();

            logger.info(`[Instagram OAuth] Connected @${igHandle} (${igUserId}) for user ${userId}`);
            res.redirect(`http://localhost:3000/settings?success=instagram_connected`);

        } catch (err: any) {
            logger.error(`[Instagram OAuth] Callback error: ${err.message}`);
            res.redirect(`http://localhost:3000/settings?error=instagram_internal_error`);
        }
    });

    /**
     * @route GET /api/v1/publish/instagram/status
     */
    instagramStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const user = await User.findById(userId);

        if (!user?.instagramConnected) {
            res.status(200).json(ApiResponse.ok({ connected: false }, 'Instagram is not connected'));
            return;
        }

        res.status(200).json(ApiResponse.ok({
            connected: true,
            accountName: user.instagramAccountName,
            handle: user.instagramAccountHandle,
            icon: user.instagramAccountIcon,
            followers: user.instagramFollowerCount,
            lastSync: user.instagramLastSync,
            tokenExpiry: user.instagramTokenExpiry,
        }, 'Instagram connection details retrieved'));
    });

    /**
     * @route POST /api/v1/publish/instagram/disconnect
     */
    disconnectInstagram = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.users?._id as string;
        const user = await User.findById(userId);

        if (user) {
            user.instagramConnected = false;
            user.instagramAccessToken = undefined as any;
            user.instagramTokenExpiry = undefined as any;
            user.instagramUserId = undefined as any;
            user.instagramAccountName = undefined as any;
            user.instagramAccountHandle = undefined as any;
            user.instagramAccountIcon = undefined as any;
            user.instagramFollowerCount = 0;
            user.instagramLastSync = undefined as any;
            await user.save();
        }

        res.status(200).json(ApiResponse.ok(null, 'Instagram disconnected successfully'));
    });
}
