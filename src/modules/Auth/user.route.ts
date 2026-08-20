import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { asyncHandler } from '../../shared/async-handler';
import { loginSchema, registerSchema, updateProfileSchema, updatePasswordSchema, updateNotificationsSchema, deleteAccountSchema, updateThemeSchema } from "./user.z.schema"
import { bearerTokenMiddleware } from "../../middlewares/bearer-token.middleware";

const userRouter = Router();

const userService = new UserService();
const userController = new UserController(userService);



/**
 * @swagger
 * /user/login:
 *   post:
 *     summary: User login
 *     description: Authenticates a user and returns a token along with user details.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 example: "securepassword123"
 *     responses:
 *       200:
 *         description: Login successful
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
 *                         user:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               example: "60d21b4667d0d8992e610c85"
 *                             firstName:
 *                               type: string
 *                               example: John
 *                             lastName:
 *                               type: string
 *                               example: Doe
 *                             email:
 *                               type: string
 *                               example: john.doe@example.com
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *                             updatedAt:
 *                               type: string
 *                               format: date-time
 *                         token:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.post("/login", bearerTokenMiddleware, validate(loginSchema), asyncHandler(userController.login))



/**
 * @swagger
 * /user/register:
 *   post:
 *     summary: User registration
 *     description: Registers a new user with the provided details.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 example: "securepassword123"
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                         _id:
 *                           type: string
 *                           example: "60d21b4667d0d8992e610c85"
 *                         firstName:
 *                           type: string
 *                           example: John
 *                         lastName:
 *                           type: string
 *                           example: Doe
 *                         email:
 *                           type: string
 *                           example: john.doe@example.com
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { accessTokenMiddleware } from "../../middlewares/access-token.middleware";

userRouter.post("/register", bearerTokenMiddleware, validate(registerSchema), asyncHandler(userController.register))

/**
 * @swagger
 * /user/profile:
 *   get:
 *     summary: Get user profile
 *     description: Returns the profile details for the authenticated user.
 *     tags:
 *       - Auth
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 */
userRouter.get("/profile", accessTokenMiddleware, asyncHandler(userController.getProfile))

/**
 * @swagger
 * /user/profile:
 *   put:
 *     summary: Update user profile
 *     description: Updates the public creator profile for the authenticated user (name, username, bio, niche, location, website, avatar, banner, social links).
 *     tags:
 *       - Auth
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       409:
 *         description: Username already taken
 */
userRouter.put("/profile", accessTokenMiddleware, validate(updateProfileSchema), asyncHandler(userController.updateProfile))

/**
 * @swagger
 * /user/notifications:
 *   put:
 *     summary: Update notification preferences
 *     description: Updates the authenticated user's email and in-app notification toggle preferences.
 *     tags:
 *       - Auth
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences updated successfully
 */
userRouter.put("/notifications", accessTokenMiddleware, validate(updateNotificationsSchema), asyncHandler(userController.updateNotifications))

/**
 * @swagger
 * /user/password:
 *   put:
 *     summary: Change password
 *     description: Updates the authenticated user's password after verifying their current password.
 *     tags:
 *       - Auth
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       401:
 *         description: Current password is incorrect
 */
userRouter.put("/password", accessTokenMiddleware, validate(updatePasswordSchema), asyncHandler(userController.updatePassword))

/**
 * @swagger
 * /user/account:
 *   delete:
 *     summary: Delete account
 *     description: Soft-deletes the authenticated user's account after verifying their password.
 *     tags:
 *       - Auth
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       401:
 *         description: Password is incorrect
 */
userRouter.delete("/account", accessTokenMiddleware, validate(deleteAccountSchema), asyncHandler(userController.deleteAccount))

/**
 * @swagger
 * /user/theme:
 *   put:
 *     summary: Update theme preference
 *     description: Updates the authenticated user's global 3-color theme (preset id, light/dark mode, and resolved primary/secondary/accent hex colors).
 *     tags:
 *       - Auth
 *     security:
 *       - accessAuth: []
 *     responses:
 *       200:
 *         description: Theme preference updated successfully
 */
userRouter.put("/theme", accessTokenMiddleware, validate(updateThemeSchema), asyncHandler(userController.updateTheme))

export default userRouter;