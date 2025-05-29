import { UserResponseDto } from "@/dtos";
import { uploadFile } from "@/middlewares/multer.middleware";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { HttpStatusCode } from "axios";
import { Request, Response, NextFunction } from "express";

class UserController {
  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    const user: UserResponseDto = req.user;

    res.status(HttpStatusCode.Created).json({
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
      const updates = req.body;

      console.log({ updates });

      res.status(HttpStatusCode.Created).json({
        success: true,
        message: "User updated successfully",
      });
    },
  ];
}

export const userController = new UserController();
