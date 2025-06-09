import { UserResponseDto } from "@/models";
import { uploadFile } from "@/middlewares/multer.middleware";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { userService } from "@/services";
import { HttpStatusCode } from "axios";
import { Request, Response, NextFunction } from "express";
import { body } from "express-validator";

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
    // this.handleAvatarUpload,
    async (req: Request, res: Response, next: NextFunction) => {
      const user = await userService.updateUser(req?.user?.id, req.body);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: user,
        message: "User updated successfully",
      });
    },
  ];

  onboard = [
    ValidatorMiddleware.dynamicFieldValidator,
    ValidatorMiddleware.inputs([
      body("topics", "").optional()
    ])
  ]
}

export const userController = new UserController();
