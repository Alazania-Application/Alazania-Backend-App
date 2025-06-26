import { postService } from "@/services";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";

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
  likePost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { postId } = req.params;

    await postService.likePost(userId, postId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      message: "Post liked successfully",
    });
  };

  sharePost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { postId } = req.params;

    await postService.sharePost(userId, postId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      message: "Post shared successfully",
    });
  };

  commentOnPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { postId } = req.params;
    const { content } = req.body;

    const comment = await postService.commentOnPost(userId, postId, content);

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: comment,
      message: "Comment added successfully",
    });
  };

  replyToComment = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { commentId } = req.params;
    const { content } = req.body;

    const reply = await postService.replyToComment(userId, commentId, content);

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: reply,
      message: "Reply added successfully",
    });
  };

  following = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    let data = await postService.getFollowingFeed(userId, req.query);

    if (!data.length) {
      data = await postService.getPersonalizedFeed(userId, req.query);
    }

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Posts fetched successfully",
    });
  };

  spotlight = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await postService.getPersonalizedFeed(userId, req.query);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Posts fetched successfully",
    });
  };
}

export const postController = new PostController();
