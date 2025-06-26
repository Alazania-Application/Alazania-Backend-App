import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { postService } from "@/services";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";
import { body, param, query } from "express-validator";

class PostController {
  createPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const payload = {
      ...req.body,
      userId,
    };

    const newPost = await postService.createPost(payload);

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: newPost,
      message: "Post created successfully",
    });
  };

  getPosts = [
    ValidatorMiddleware.inputs([
      query("type", "type must either be 'spotlight' or 'following'")
        .optional()
        .isIn(["spotlight", "following"])
        .withMessage("type must be either 'spotlight' or 'following'"),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const type = String(req.query?.type).trim().toLowerCase() || "following";

      // TODO: determine type of posts to show based on selected type

      let data = await postService.getFollowingFeed(userId, req.query);

      if (!data.length) {
        data = await postService.getPersonalizedFeed(userId, req.query);
      }

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "Posts fetched successfully",
      });
    },
  ];

  // LIKES
  likeAPost = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const postId = req.params?.postId;

      const data = await postService.likePost(userId, postId);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "Post liked successfully",
      });
    },
  ];

  unlikeAPost = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const postId = req.params?.postId;

      const data = await postService.unlikePost(userId, postId);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "Post unliked successfully",
      });
    },
  ];

  getPostLikes = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const postId = req.params?.postId;

      const data = await postService.getPostLikes(postId);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "Likes fetched successfully",
      });
    },
  ];

  sharePost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { postId } = req.params;

    await postService.sharePost(userId, postId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      message: "Post shared successfully",
    });
  };

  // COMMENTS
  getPostComments = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const postId = req.params?.postId;

      const data = await postService.getPostComments(postId);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data,
        message: "Comments fetched successfully",
      });
    },
  ];

  commentOnPost = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").exists().isUUID(),
      body("comment", "Cannot post an empty comment").exists().isString(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const postId = req.params?.postId;
      const { comment: content } = req.body;

      const comment = await postService.commentOnPost(userId, postId, content);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: comment,
        message: "Comment added successfully",
      });
    },
  ];

  replyToComment = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").exists().isUUID(),
      body("comment", "Cannot post an empty comment").exists().isString(),
      body("parentCommentId", "parentCommentId is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const postId = req.params?.postId;
      const { comment: content, parentCommentId } = req.body;

      const reply = await postService.replyToComment(
        userId,
        postId,
        parentCommentId,
        content
      );

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: reply,
        message: "Reply added successfully",
      });
    },
  ];

  likeAComment = [
    ValidatorMiddleware.inputs([
      param("commentId", "commentId is required").exists().isUUID(),
    ]),

    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const commentId = req.params?.commentId;

      const reply = await postService.likeAComment(userId, commentId);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: reply,
        message: "Comment liked successfully",
      });
    },
  ];

  unlikeAComment = [
    ValidatorMiddleware.inputs([
      param("commentId", "commentId is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const commentId = req.params?.commentId;

      const reply = await postService.unlikeAComment(userId, commentId);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: reply,
        message: "Comment unliked successfully",
      });
    },
  ];
}

export const postController = new PostController();
