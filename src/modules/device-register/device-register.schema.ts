import mongoose from "mongoose";
const device = new mongoose.Schema({
    deviceIp: {
        type: String,
        required: true,
        trim: true
    },
    latitude: {
        type: Number,
        required: true,
    },
    longitude: {
        type: Number,
        required: true,
    },
    os: {
        type: String,
        required: true,
        trim: true
    },
    deviceType: {
        type: String,
        required: true,
        trim: true
    }
})
const Device = mongoose.model("Device", device);
export default Device