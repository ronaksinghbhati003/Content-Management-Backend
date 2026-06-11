import { Request, Response } from "express";
import { DeviceService } from "./device-register.service";
import { ApiResponse } from "../../shared/api-response";

export class DeviceController {
    private readonly deviceService: DeviceService;
    constructor(deviceService: DeviceService) {
        this.deviceService = deviceService;
    }

    registerDevice = async (req: Request, res: Response) => {
        const result = await this.deviceService.deviceRegister(req.body);
        return res.status(201).json(ApiResponse.created(result, "Device registered successfully"))
    }

}