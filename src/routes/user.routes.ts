import { Router } from "express";
import { userController } from "@/controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { multerConfig } from "@/middlewares/upload.middleware";
import { userValidator } from "@/middlewares/validators";

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
  userValidator.validateUpload,
  userController.handleAvatarUpload,
  userValidator.validateOnboardUpdate,
  userController.onboardUpdate
);

userRouter.put(
  "/update",
  authMiddleWare.protectRoute,
  multerConfig.single("avatar"),
  userValidator.validateUpload,
  userController.handleAvatarUpload,
  userValidator.validateUpdate,
  userController.update
);

userRouter.patch(
  "/follow/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.followUser
);

userRouter.patch(
  "/unfollow/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.unfollowUser
);

userRouter.patch(
  "/block/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.blockUser
);

userRouter.patch(
  "/unblock/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.unblockUser
);

userRouter.patch(
  "/report/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.reportUser
);

userRouter.get(
  "/followers/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.getUserFollowers
);

userRouter.get(
  "/following/:userId",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.getUserFollowing
);
userRouter.get(
  "/my-followers",
  authMiddleWare.protectRoute,
  userController.getMyFollowers
);

userRouter.get(
  "/my-following",
  authMiddleWare.protectRoute,
  userController.getMyFollowing
);

userRouter.get(
  "/:id",
  authMiddleWare.protectRoute,
  userValidator.validateUserId,
  userController.getUserProfile
);
