import { Router } from "express";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { postController } from "@/controllers";
import { postValidator } from "@/middlewares/validators";

export const postRouter = Router();

postRouter.post(
  "/generate-upload-url",
  authMiddleWare.protectRoute,
  postValidator.validatePresignedUrl,
  postController.getPreSignedUrl
);

postRouter.post(
  "/publish",
  authMiddleWare.protectRoute,
  postValidator.validatePostCreation,
  postController.publishPost
);

postRouter.get(
  "/initialize",
  authMiddleWare.protectRoute,
  postController.initializePostSession
);

postRouter.get(
  "/user/:userId",
  authMiddleWare.protectRoute,
  postValidator.validateGetUserPosts,
  postController.getUserPosts
);

postRouter.get(
  "/my-posts",
  authMiddleWare.protectRoute,
  postController.getMyPosts
);

postRouter.get(
  "/hashtag",
  authMiddleWare.protectRoute,
  postValidator.validateHashtag,
  postController.getPostsByHashtag
);


postRouter.get(
  "/following",
  authMiddleWare.protectRoute,
  postController.getFollowingPosts
);

postRouter.get(
  "/spotlight",
  authMiddleWare.protectRoute,
  postController.getSpotlightPosts
);

postRouter.get(
  "/",
  authMiddleWare.protectRoute,
  postController.getSpotlightPosts
);

postRouter.get(
  "/:postId/likes",
  authMiddleWare.protectRoute,
  postValidator.validatePostId,
  postController.getPostLikes
);

postRouter.get(
  "/:postId/comments",
  authMiddleWare.protectRoute,
  postValidator.validatePostId,
  postController.getPostComments
);

postRouter.get(
  "/:postId/:commentId/replies",
  authMiddleWare.protectRoute,
  postValidator.validatePostAndCommentId,
  postController.getPostCommentReplies
);

postRouter.post(
  "/report/:postId",
  authMiddleWare.protectRoute,
  postValidator.validatePostId,
  postController.reportAPost
);

// postRouter.post("/", authMiddleWare.protectRoute, multerConfig.array("images"), postController.createPost);

postRouter.patch(
  "/comment/like/:commentId",
  authMiddleWare.protectRoute,
  postValidator.validateCommentId,
  postController.likeAComment
);

postRouter.patch(
  "/comment/unlike/:commentId",
  authMiddleWare.protectRoute,
  postValidator.validateCommentId,
  postController.unlikeAComment
);

postRouter.post(
  "/:postId/like",
  authMiddleWare.protectRoute,
  postValidator.validatePostId,
  postController.likeAPost
);

postRouter.post(
  "/:postId/unlike",
  authMiddleWare.protectRoute,
  postValidator.validatePostId,
  postController.unlikeAPost
);

postRouter.post(
  "/:postId/share",
  authMiddleWare.protectRoute,
  postController.sharePost
);

postRouter.post(
  "/:postId/comment/reply/:commentId",
  authMiddleWare.protectRoute,
  postValidator.validateCommentReply,
  postController.replyToComment
);


postRouter.post(
  "/:postId/comment",
  authMiddleWare.protectRoute,
  postValidator.validateComment,
  postController.commentOnPost
);


postRouter.get(
  "/:postId",
  authMiddleWare.protectRoute,
  postValidator.validatePostId,
  postController.getPostById
);