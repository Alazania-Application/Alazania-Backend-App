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
userRouter.get(
  "/suggested-users",
  authMiddleWare.protectRoute,
  userController.getSuggestedUsers
);

userRouter.get("/", authMiddleWare.protectRoute, userController.getUsers);

userRouter.put(
  "/onboard/update",
  authMiddleWare.protectRoute,
  multerConfig.single("avatar"),
  userController.handleAvatarUpload,
  userController.onboardUpdate
);
userRouter.put(
  "/update",
  authMiddleWare.protectRoute,
  multerConfig.single("avatar"),
  userController.handleAvatarUpload,
  userController.update
);
