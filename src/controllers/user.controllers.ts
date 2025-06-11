import { UserResponseDto } from "@/models";
import { uploadFile } from "@/middlewares/multer.middleware";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { hashtagService, topicService, userService } from "@/services";
import { HttpStatusCode } from "axios";
import { NextFunction, Request, Response } from "express";
import { body } from "express-validator";
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
    ]),
    async (req: Request, res: Response) => {
      const user = await userService.updateUser(req?.user?.id, req.body);

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
}

export const userController = new UserController();
