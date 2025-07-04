import { Router } from "express";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { postController } from "@/controllers";
import { multerConfig } from "@/middlewares/upload.middleware";

export const postRouter = Router();

postRouter.post(
  "/generate-upload-url",
  authMiddleWare.protectRoute,
  postController.getPreSignedUrl
);

// postRouter.get(
//   "/initialize",
//   authMiddleWare.protectRoute,
//   postController.initializePostSession
// );

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

postRouter.post("/", authMiddleWare.protectRoute, multerConfig.array("images"), postController.createPost);

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


