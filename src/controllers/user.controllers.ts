import { UserResponseDto } from "@/models";
import { uploadFile } from "@/middlewares/upload.middleware";
import {
  hashtagService,
  postService,
  topicService,
  userService,
} from "@/services";
import { HttpStatusCode } from "axios";
import { NextFunction, Request, Response } from "express";
import slugify from "slugify";

class UserController {
  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    const user: UserResponseDto = req.user;

    const postCount = await postService.getPostCount(user?.id);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: {
        ...user,
        totalPosts: postCount,
      },
      message: "User profile fetched successfully",
    });
  };

  /**
   * Handle avatar upload
   */
  handleAvatarUpload = async (
    req: Request,
    _: Response,
    next: NextFunction
  ) => {
    const user = req?.user;
    const avatar = req.file as Express.Multer.File;

    if (avatar) {
      const fileBuffer = avatar.buffer;

      const fileName = `${user?.id}/avatar`;

      const fileUrl = await uploadFile(fileBuffer, fileName);

      req.body.avatar = fileUrl;
    }
    next();
  };

  update = async (req: Request, res: Response) => {
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
  };

  onboardUpdate = async (req: Request, res: Response) => {
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
  };

  getUsers = [
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const users = await userService.getUsers({  ...req.query , userId });

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: users,
        message: "Users fetched successfully",
      });
    },
  ];

  getUserProfile = async (req: Request, res: Response) => {
    const currentUser = req?.user?.id;
    const userId = req?.params?.id;

    const user = await userService.getUserProfile({ currentUser, userId });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: user,
      message: "Users fetched successfully",
    });
  };

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

  reportUser = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.reportUser(
      userId,
      req.params.userId,
      req.body?.reason ?? ""
    );

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "User reported successfully",
    });
  };

  blockUser = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.blockUser(userId, req.params.userId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "User blocked successfully",
    });
  };

  unblockUser = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.unBlockUser(userId, req.params.userId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "User unblocked successfully",
    });
  };

  followUser = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.followUser(userId, req.params.userId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "User followed successfully",
    });
  };

  unfollowUser = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await userService.unfollowUser(userId, req.params.userId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "User unfollowed successfully",
    });
  };

  getUserFollowers = async (req: Request, res: Response) => {
    const loggedInUser = req?.user?.id ?? "";
    const userToMatchId = req?.params?.userId ?? "";

    const { users, pagination } = await userService.getUserFollowers({
      loggedInUser,
      userToMatchId,
      limit: 100,
      page: 0,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: users,
      pagination,
      message: "User follower(s) fetched successfully",
    });
  };

  getUserFollowing = async (req: Request, res: Response) => {
    const loggedInUser = req?.user?.id ?? "";
    const userToMatchId = req?.params?.userId ?? "";

    const { users, pagination } = await userService.getUserFollowing({
      loggedInUser,
      userToMatchId,
      limit: 100,
      page: 0,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: users,
      pagination,
      message: "User following(s) fetched successfully",
    });
  };

  getMyFollowers = async (req: Request, res: Response) => {
    const currentUserId = req?.user?.id ?? "";

    const { users, pagination } = await userService.getMyFollowers({
      currentUserId,
      limit: 100,
      page: 0,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: users,
      pagination,
      message: "My follower(s) fetched successfully",
    });
  };

  getMyFollowing = async (req: Request, res: Response) => {
    const currentUserId = req?.user?.id ?? "";

    const { users, pagination } = await userService.getMyFollowing({
      currentUserId,
      limit: 100,
      page: 0,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: users,
      pagination,
      message: "My following(s) fetched successfully",
    });
  };
}

export const userController = new UserController();
