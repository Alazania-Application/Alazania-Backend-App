import { userController } from "@/controllers/user.controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { multerConfig } from "@/middlewares/multer.middleware";
import { Router } from "express";

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
