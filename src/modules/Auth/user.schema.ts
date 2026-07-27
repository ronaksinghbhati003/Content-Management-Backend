import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,

    },
    passwordHash: {
        type: String,
        required: true,
        trim: true
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: {
        type: Date,
        default: null
    },

    // Public creator profile (Settings > Profile tab)
    username: {
        type: String,
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true, // allows many docs with no username yet
    },
    bio: {
        type: String,
        default: '',
        maxlength: 160,
    },
    niche: {
        type: String,
        default: '',
    },
    location: {
        type: String,
        default: '',
    },
    website: {
        type: String,
        default: '',
    },
    avatar: {
        type: String,
        default: '',
    },
    bannerIndex: {
        type: Number,
        default: 0,
    },
    socialLinks: {
        youtube: { type: String, default: '' },
        instagram: { type: String, default: '' },
        tiktok: { type: String, default: '' },
        twitter: { type: String, default: '' },
    },

    // YouTube OAuth & Account Connection Status
    youtubeConnected: {
        type: Boolean,
        default: false
    },
    youtubeAccessToken: {
        type: String
    },
    youtubeRefreshToken: {
        type: String
    },
    youtubeTokenExpiry: {
        type: Date
    },
    youtubeChannelId: {
        type: String
    },
    youtubeChannelName: {
        type: String
    },
    youtubeChannelHandle: {
        type: String
    },
    youtubeChannelIcon: {
        type: String
    },
    youtubeSubscriberCount: {
        type: Number,
        default: 0
    },
    youtubeLastSync: {
        type: Date
    },

    // Instagram OAuth & Account Connection Status
    instagramConnected: {
        type: Boolean,
        default: false
    },
    instagramAccessToken: {
        type: String
    },
    instagramTokenExpiry: {
        type: Date
    },
    instagramUserId: {
        type: String
    },
    instagramAccountName: {
        type: String
    },
    instagramAccountHandle: {
        type: String
    },
    instagramAccountIcon: {
        type: String
    },
    instagramFollowerCount: {
        type: Number,
        default: 0
    },
    instagramLastSync: {
        type: Date
    },

    // Optional yt-dlp cookies (Netscape cookies.txt format) — improves clip download
    // quality above 360p by authenticating as a logged-in browser session. Per-user
    // so one account's expired/missing cookies don't affect other users' downloads.
    ytDlpCookiesText: {
        type: String,
        select: false,
    },
    ytDlpCookiesUpdatedAt: {
        type: Date
    }
}, { timestamps: true })

const User = mongoose.model("Users", userSchema);
export default User;