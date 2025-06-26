import { Router } from "express";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { postController } from "@/controllers";

export const postRouter = Router();

postRouter.post("/", authMiddleWare.protectRoute, postController.createPost);

postRouter.post(
  "/:postId/like",
  authMiddleWare.protectRoute,
  postController.likePost
);

postRouter.post(
  "/:postId/share",
  authMiddleWare.protectRoute,
  postController.sharePost
);

postRouter.post(
  "/:postId/comment",
  authMiddleWare.protectRoute,
  postController.commentOnPost
);

postRouter.post(
  "/comment/:commentId/reply",
  authMiddleWare.protectRoute,
  postController.replyToComment
);

postRouter.get(
  "/following",
  authMiddleWare.protectRoute,
  postController.following
);

postRouter.get(
  "/spotlight",
  authMiddleWare.protectRoute,
  postController.spotlight
);
