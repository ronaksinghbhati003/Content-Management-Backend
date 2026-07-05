import { Request, Response } from 'express';
import { ApiResponse } from "../../shared/api-response";
import { UserService } from "./user.service";
import { hashPassword } from "../../utils/hash.pass";
import RegisterData from './user.service';
import User from "./user.schema";
import { AlreadyExistsException } from '../../shared/http-exception';

export class UserController {
    private readonly userService: UserService
    constructor(userService: UserService) {
        this.userService = userService;
    }


    login = async (req: Request, res: Response): Promise<void> => {
        const { email, password } = req.body;
        const data = await this.userService.login({ email, password });
        res.status(200).json(ApiResponse.ok(data, "Login Successfull"))
    }


    register = async (req: Request, res: Response): Promise<void> => {
        const { firstName, lastName, email, password } = req.body;

        const checkIsAlreadyExist = await User.findOne({ email });

        if (checkIsAlreadyExist) {
            throw new AlreadyExistsException(`Email ${email} already exists`);
        }



        const hashedPassword = await hashPassword(password);

        const payload: RegisterData = {
            firstName,
            lastName,
            email,
            passwordHash: hashedPassword
        }

        const data = await this.userService.register(payload);
        res.status(201).json(ApiResponse.created(data, "User Registered Successfully"))

    }

    getProfile = async (req: any, res: Response): Promise<void> => {
        const userId = req.users?._id;
        const profile = await this.userService.getProfile(userId);
        res.status(200).json(ApiResponse.ok(profile, "Profile fetched successfully"));
    }
}