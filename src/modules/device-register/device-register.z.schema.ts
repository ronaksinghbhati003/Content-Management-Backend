import { z } from "zod";

const deviceRegisterSchema = z.object({
    deviceIp: z.string().min(1, "IP is required"),
    latitude: z.number().min(1, "Latitude is required"),
    longitude: z.number().min(1, "Longitude is required"),
    os: z.string().min(1, "OS is required"),
    deviceType: z.string().min(1, "Device type is required")
})

export { deviceRegisterSchema }