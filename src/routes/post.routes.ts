import { Router } from "express";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { postController } from "@/controllers";

export const postRouter = Router();

postRouter.get(
  "/",
  authMiddleWare.protectRoute,
  postController.getPosts
);
postRouter.get(
  "/:postId/likes",
  authMiddleWare.protectRoute,
  postController.getPostLikes
);
postRouter.get(
  "/:postId/comments",
  authMiddleWare.protectRoute,
  postController.getPostComments
);

postRouter.post("/", authMiddleWare.protectRoute, postController.createPost);

postRouter.post(
  "/:postId/like",
  authMiddleWare.protectRoute,
  postController.likeAPost
);
postRouter.post(
  "/:postId/unlike",
  authMiddleWare.protectRoute,
  postController.unlikeAPost
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


