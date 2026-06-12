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
}
