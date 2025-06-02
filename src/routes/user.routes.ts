import { Router } from "express";
import { userController } from "@/controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { multerConfig } from "@/middlewares/multer.middleware";

export const userRouter = Router();

userRouter.get(
  "/profile",
  authMiddleWare.protectRoute,
  userController.getProfile
);
userRouter.put(
  "/update",
  authMiddleWare.protectRoute,
  multerConfig.single("avatar"),
  userController.handleAvatarUpload,
  userController.update
);
