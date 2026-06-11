import { Router } from "express";
import { deviceRegisterSchema } from "./device-register.z.schema"
import { validate } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../shared/async-handler";
import { DeviceController } from "./device-register.controller";
import { DeviceService } from "./device-register.service";

const deviceService = new DeviceService();
const deviceController = new DeviceController(deviceService);


const deviceRouter = Router();


/**
 * @swagger
 * /device/register:
 *   post:
 *     summary: Register a new device
 *     description: Registers a device with IP, location, OS, and type, and returns a bearer token.
 *     tags:
 *       - Device
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceIp
 *               - latitude
 *               - longitude
 *               - os
 *               - deviceType
 *             properties:
 *               deviceIp:
 *                 type: string
 *                 example: "192.168.1.1"
 *               latitude:
 *                 type: number
 *                 example: 26.9124
 *               longitude:
 *                 type: number
 *                 example: 75.7873
 *               os:
 *                 type: string
 *                 example: "Windows"
 *               deviceType:
 *                 type: string
 *                 example: "Desktop"
 *     responses:
 *       201:
 *         description: Device registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         deviceIp:
 *                           type: string
 *                         latitude:
 *                           type: number
 *                         longitude:
 *                           type: number
 *                         os:
 *                           type: string
 *                         deviceType:
 *                           type: string
 *                         bearerToken:
 *                           type: string
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deviceRouter.post("/register", validate(deviceRegisterSchema), asyncHandler(deviceController.registerDevice))



export default deviceRouter;
