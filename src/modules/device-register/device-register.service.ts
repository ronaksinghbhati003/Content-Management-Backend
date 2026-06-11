import logger from "../../config/logger"
import { generateToken } from "../../utils/jwt"
import Device from "./device-register.schema"

interface DeviceInterFace {
    deviceIp: string,
    latitude: number,
    longitude: number,
    os: string,
    deviceType: string
}

export interface DeviceResponse {
    deviceIp: string,
    latitude: number,
    longitude: number,
    os: string,
    deviceType: string
    bearerToken: string
    _id: string;
}


export class DeviceService {
    deviceRegister = async (data: DeviceInterFace): Promise<DeviceResponse> => {
        const result = await Device.create(data)
        logger.info(`Type of Result After Creating ${typeof result}`)
        logger.info(`Device Register Information ${result}`)
        const token = await generateToken(result.toObject())
        return {
            _id: result._id.toString(),
            deviceIp: result.deviceIp,
            latitude: result.latitude,
            longitude: result.longitude,
            os: result.os,
            deviceType: result.deviceType,
            bearerToken: token
        }

    }
}