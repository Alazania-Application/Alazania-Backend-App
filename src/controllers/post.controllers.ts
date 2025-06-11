import { postService } from "@/services";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";

class PostController {
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
