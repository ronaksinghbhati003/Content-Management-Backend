import User from '../Auth/user.schema';
import logger from '../../config/logger';
import { getOrRefreshAccessToken } from '../publish/platforms/youtube.adapter';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const IG_API = 'https://graph.instagram.com/v21.0';

function fmt(num: number): string {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

function parseDuration(iso: string): string {
    // ISO 8601 duration: PT4M13S → "4:13"
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '';
    const h = parseInt(m[1] || '0');
    const min = parseInt(m[2] || '0');
    const sec = parseInt(m[3] || '0');
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${min}:${String(sec).padStart(2, '0')}`;
}

export class AnalyticsService {
    async getAnalytics(userId: string) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        // ── Default disconnected state ──────────────────────────────────────
        let channelStats = { viewCount: 0, subscriberCount: 0, videoCount: 0, connected: false, channelName: '' };
        let topVideos: any[] = [];

        if (user.youtubeConnected) {
            // Mark connected immediately — the account is linked even if the API call fails
            channelStats.connected = true;
            channelStats.channelName = user.youtubeChannelName || '';
            channelStats.subscriberCount = user.youtubeSubscriberCount || 0;

            try {
                const token = await getOrRefreshAccessToken(userId);

                // Step 1: Channel stats + uploads playlist ID
                const chRes = await fetch(
                    `${YT_API}/channels?part=snippet,statistics,contentDetails&mine=true`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!chRes.ok) throw new Error(`Channel fetch failed: ${await chRes.text()}`);

                const chData = await chRes.json() as any;
                const ch = chData.items?.[0];

                if (ch) {
                    const viewCount        = Number(ch.statistics?.viewCount       || 0);
                    const subscriberCount  = Number(ch.statistics?.subscriberCount || 0);
                    const videoCount       = Number(ch.statistics?.videoCount      || 0);

                    channelStats = { viewCount, subscriberCount, videoCount, connected: true, channelName: ch.snippet?.title || '' };

                    // Persist channel info to DB
                    user.youtubeSubscriberCount  = subscriberCount;
                    user.youtubeChannelName       = ch.snippet?.title || '';
                    user.youtubeChannelHandle     = ch.snippet?.customUrl || '';
                    user.youtubeChannelIcon       = ch.snippet?.thumbnails?.default?.url || '';
                    user.youtubeLastSync          = new Date();
                    await user.save();

                    // Step 2: Fetch latest 50 videos from uploads playlist
                    const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
                    if (uploadsPlaylistId) {
                        const plRes = await fetch(
                            `${YT_API}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (plRes.ok) {
                            const plData = await plRes.json() as any;
                            const videoIds: string[] = (plData.items || []).map((i: any) => i.contentDetails.videoId);

                            if (videoIds.length > 0) {
                                // Step 3: Batch fetch video stats (snippet + statistics + contentDetails for duration)
                                const vRes = await fetch(
                                    `${YT_API}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&maxResults=50`,
                                    { headers: { Authorization: `Bearer ${token}` } }
                                );
                                if (vRes.ok) {
                                    const vData = await vRes.json() as any;
                                    topVideos = (vData.items || [])
                                        .map((v: any) => ({
                                            id:          v.id,
                                            title:       v.snippet?.title || 'Untitled',
                                            thumbnail:   v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
                                            publishedAt: v.snippet?.publishedAt || '',
                                            duration:    parseDuration(v.contentDetails?.duration || ''),
                                            views:       Number(v.statistics?.viewCount    || 0),
                                            likes:       Number(v.statistics?.likeCount    || 0),
                                            comments:    Number(v.statistics?.commentCount || 0),
                                            url:         `https://www.youtube.com/watch?v=${v.id}`,
                                        }))
                                        .sort((a: any, b: any) => b.views - a.views)
                                        .slice(0, 10);
                                }
                            }
                        }
                    }
                }
            } catch (err: any) {
                logger.error(`[Analytics] YouTube fetch error: ${err.message}`);
                // Fallback to cached DB values
                channelStats = {
                    viewCount:       0,
                    subscriberCount: user.youtubeSubscriberCount || 0,
                    videoCount:      0,
                    connected:       true,
                    channelName:     user.youtubeChannelName || '',
                };
            }
        }

        // ── Instagram ────────────────────────────────────────────────────────
        let igStats = {
            followerCount: user.instagramFollowerCount || 0,
            mediaCount: 0,
            username: user.instagramAccountName || user.instagramAccountHandle || '',
            connected: false,
        };
        let topInstagramPosts: any[] = [];

        if (user.instagramConnected && user.instagramAccessToken && user.instagramUserId) {
            igStats.connected = true;

            try {
                const token = user.instagramAccessToken;
                const igUserId = user.instagramUserId;

                // Step 1: Account-level stats
                const acctRes = await fetch(
                    `${IG_API}/${igUserId}?fields=username,media_count,followers_count,profile_picture_url&access_token=${token}`
                );
                if (!acctRes.ok) throw new Error(`Instagram account fetch failed: ${await acctRes.text()}`);
                const acct = await acctRes.json() as any;

                const followerCount = Number(acct.followers_count || 0);
                const mediaCount    = Number(acct.media_count || 0);

                igStats = { followerCount, mediaCount, username: acct.username || '', connected: true };

                // Persist latest snapshot to DB
                user.instagramFollowerCount = followerCount;
                user.instagramAccountName   = acct.username || user.instagramAccountName;
                user.instagramAccountIcon   = acct.profile_picture_url || user.instagramAccountIcon;
                user.instagramLastSync      = new Date();
                await user.save();

                // Step 2: Recent media (Reels + posts) with engagement counts
                const mediaRes = await fetch(
                    `${IG_API}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${token}`
                );
                if (mediaRes.ok) {
                    const mediaData = await mediaRes.json() as any;
                    topInstagramPosts = (mediaData.data || [])
                        .map((m: any) => ({
                            id:          m.id,
                            caption:     (m.caption || 'Untitled').split('\n')[0].slice(0, 100),
                            mediaType:   m.media_type,
                            // Videos/Reels don't expose a directly embeddable media_url for
                            // display purposes — thumbnail_url is the safe cross-type choice.
                            thumbnail:   m.thumbnail_url || m.media_url || '',
                            publishedAt: m.timestamp || '',
                            likes:       Number(m.like_count || 0),
                            comments:    Number(m.comments_count || 0),
                            url:         m.permalink || '',
                        }))
                        .sort((a: any, b: any) => b.likes - a.likes)
                        .slice(0, 10);
                }
            } catch (err: any) {
                logger.error(`[Analytics] Instagram fetch error: ${err.message}`);
                // Fallback to cached DB values
                igStats = {
                    followerCount: user.instagramFollowerCount || 0,
                    mediaCount:    0,
                    username:      user.instagramAccountName || user.instagramAccountHandle || '',
                    connected:     true,
                };
            }
        }

        const stats = [
            {
                name:    'Total Views',
                iconKey: 'Play',
                value:   channelStats.connected ? fmt(channelStats.viewCount) : null,
                raw:     channelStats.connected ? channelStats.viewCount : null,
            },
            {
                name:    'Subscribers',
                iconKey: 'Users',
                value:   channelStats.connected ? fmt(channelStats.subscriberCount) : null,
                raw:     channelStats.connected ? channelStats.subscriberCount : null,
            },
            {
                name:    'Total Videos',
                iconKey: 'Video',
                value:   channelStats.connected ? fmt(channelStats.videoCount) : null,
                raw:     channelStats.connected ? channelStats.videoCount : null,
            },
        ];

        const avgLikes = topInstagramPosts.length
            ? Math.round(topInstagramPosts.reduce((sum, p) => sum + p.likes, 0) / topInstagramPosts.length)
            : 0;

        const instagramStats = [
            {
                name:    'Followers',
                iconKey: 'Users',
                value:   igStats.connected ? fmt(igStats.followerCount) : null,
                raw:     igStats.connected ? igStats.followerCount : null,
            },
            {
                name:    'Posts',
                iconKey: 'Grid3x3',
                value:   igStats.connected ? fmt(igStats.mediaCount) : null,
                raw:     igStats.connected ? igStats.mediaCount : null,
            },
            {
                name:    'Avg Likes (recent)',
                iconKey: 'Heart',
                value:   igStats.connected ? fmt(avgLikes) : null,
                raw:     igStats.connected ? avgLikes : null,
            },
        ];

        return {
            youtubeConnected: channelStats.connected,
            channelName:      channelStats.channelName,
            stats,
            topVideos,
            // Analytics API (time-series, CTR, revenue, geography) requires
            // additional OAuth scope — not yet connected.
            analyticsApiConnected: false,

            instagramConnected: igStats.connected,
            instagramUsername:  igStats.username,
            instagramStats,
            topInstagramPosts,

            // Real count of connected platforms — drives the Dashboard's
            // "N platforms connected" indicator, which previously always read
            // 0 because nothing populated this field.
            connectedCount: (channelStats.connected ? 1 : 0) + (igStats.connected ? 1 : 0),
        };
    }
}

export const analyticsService = new AnalyticsService();
