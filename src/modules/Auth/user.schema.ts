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
    }
}, { timestamps: true })

const User = mongoose.model("Users", userSchema);
export default User;