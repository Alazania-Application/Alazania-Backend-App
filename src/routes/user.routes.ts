import { Router } from "express";
import { userController } from "@/controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { multerConfig } from "@/middlewares/upload.middleware";

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

userRouter.get(
  "/",
  authMiddleWare.protectRoute,
  userController.getUsers
);


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

userRouter.patch(
  "/follow/:userId",
  authMiddleWare.protectRoute,
  userController.followUser
);

userRouter.patch(
  "/unfollow/:userId",
  authMiddleWare.protectRoute,
  userController.unfollowUser
);

userRouter.patch(
  "/block/:userId",
  authMiddleWare.protectRoute,
  userController.blockUser
);

userRouter.patch(
  "/unblock/:userId",
  authMiddleWare.protectRoute,
  userController.unblockUser
);

userRouter.patch(
  "/report/:userId",
  authMiddleWare.protectRoute,
  userController.reportUser
);


userRouter.get(
  "/followers/:userId",
  authMiddleWare.protectRoute,
  userController.getUserFollowers
);

userRouter.get(
  "/following/:userId",
  authMiddleWare.protectRoute,
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
  userController.getUserProfile
);