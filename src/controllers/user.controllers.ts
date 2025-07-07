import { UserResponseDto } from "@/models";
import { uploadFile } from "@/middlewares/upload.middleware";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { hashtagService, topicService, userService } from "@/services";
import { HttpStatusCode } from "axios";
import { NextFunction, Request, Response } from "express";
import { body, param } from "express-validator";
import slugify from "slugify";

class UserController {
  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    const user: UserResponseDto = req.user;

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: user,
      message: "User profile fetched successfully",
    });
  };

  /**
   * Handle avatar upload
   */
  handleAvatarUpload = [
    ValidatorMiddleware.dynamicFieldValidator,
    async (req: Request, res: Response, next: NextFunction) => {
      const user = req?.user;
      const avatar = req.file as Express.Multer.File;

      if (avatar) {
        const fileBuffer = avatar.buffer;

        const fileName = `${user?.id}/avatar`;

        const fileUrl = await uploadFile(fileBuffer, fileName);

        req.body.avatar = fileUrl;
      }
      next();
    },
  ];

  update = [
    ValidatorMiddleware.dynamicFieldValidator,
    ValidatorMiddleware.inputs([
      body(
        "username",
        "Username must be 3-20 characters, alphanumeric, start with a letter, and may contain _-."
      )
        .optional()
        .isString()
        .isLength({ min: 3, max: 20 })
        .matches(/^[A-Za-z][A-Za-z0-9_\-\.]*$/),
      body("bio", "bio must be between 0-125 characters")
        .optional()
        .isString()
        .isLength({ min: 0, max: 125 }),
    ]),
    async (req: Request, res: Response) => {
      const updates = { ...req.body };
      if ("lastLogin" in updates) {
        delete updates["lastLogin"];
      }
      const user = await userService.updateUser(req?.user?.id, updates);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: user,
        message: "User updated successfully",
      });
    },
  ];

  onboardUpdate = [
    ValidatorMiddleware.dynamicFieldValidator,
    ValidatorMiddleware.inputs([
      body(
        "username",
        "Username must be 3-20 characters, alphanumeric, start with a letter, and may contain _-."
      )
        .optional()
        .isString()
        .isLength({ min: 3, max: 20 })
        .matches(/^[A-Za-z][A-Za-z0-9_\-\.]*$/),
      body("topics", "Please provide topics").optional().isArray(),
      body("topics.*", "Each topic must be a string").exists().isString(),
      body("hashtags", "Please provide hashtags").optional().isArray(),
      body("hashtags.*", "Each hashtag must be a string").exists().isString(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const topics = req.body?.topics;
      const hashtags = req.body?.hashtags;
      const promises = [];

      if (topics?.length) {
        const topicsArray = (
          Array.isArray(topics) ? topics : topics?.split(",")
        ).map((v: string) =>
          slugify(v, {
            trim: true,
            lower: true,
          })
        );
        promises.push(topicService.addUserInterests(userId, topicsArray));
      }

      if (hashtags?.length) {
        const hashtagArray = (
          Array.isArray(hashtags) ? hashtags : hashtags?.split(",")
        ).map((v: string) =>
          slugify(v, {
            trim: true,
            lower: true,
          })
        );
        promises.push(hashtagService.followHashtags(userId, hashtagArray));
      }

      if (Object.values(req.body).length) {
        promises.push(userService.updateOnboardUser(userId, req.body));
      }

      await Promise.all(promises);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        message: "Profile updated successfully",
      });
    },
  ];

  getUsers = [
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const users = await userService.getUsers({ userId });

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: users,
        message: "Users fetched successfully",
      });
    },
  ];

  getSuggestedUsers = [
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const users = await userService.getSuggestedUsers({ userId });

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: users,
        message: "Users fetched successfully",
      });
    },
  ];

  followUser = [
    ValidatorMiddleware.inputs([
      param("userId", "User id is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const data = await userService.followUser(userId, req.params.userId);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "User followed successfully",
      });
    },
  ];

  unfollowUser = [
    ValidatorMiddleware.inputs([
      param("userId", "User id is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const data = await userService.unfollowUser(userId, req.params.userId);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "User unfollowed successfully",
      });
    },
  ];

  getUserFollowers = [
    ValidatorMiddleware.inputs([
      param("userId", "User id is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const data = await userService.getUserFollowers(
        userId,
        req.params.userId
      );

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "User follower(s) fetched successfully",
      });
    },
  ];

  getUserFollowing = [
    ValidatorMiddleware.inputs([
      param("userId", "User id is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const data = await userService.getUserFollowing(
        userId,
        req.params.userId
      );

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "User following(s) fetched successfully",
      });
    },
  ];

  getMyFollowers = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.getMyFollowers(userId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "My follower(s) fetched successfully",
    });
  };

  getMyFollowing = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.getMyFollowing(userId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "My following(s) fetched successfully",
    });
  };
}

export const userController = new UserController();
