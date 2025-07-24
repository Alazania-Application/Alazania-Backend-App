import { SPACES_BUCKET } from "@/config";
import {
  deleteFolderByPrefix,
  s3Config,
} from "@/middlewares/upload.middleware";
import { IPostFile } from "@/models";
import { postService } from "@/services";
import { ErrorResponse } from "@/utils";
import { CopyObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";
import path from "path";
import { v4 as uuidv4 } from "uuid";

class PostController {
  publishPost = [
    async (req: Request, res: Response) => {
      const userId = req.user?.id;
      const { sessionId, caption } = req.body;
      const files = req?.body?.files as IPostFile[];

      const sessionPrefix = `${userId}/temp-uploads/${sessionId}`;
      await postService.validatePostAndSessionIds(userId, sessionId);
      await postService.validateDuplicatePost(userId, sessionId);

      await Promise.all(
        files.map(async (file) => {
          const tempKey = file.key;
          // Security check: Ensure the key starts with the temporary prefix
          if (!tempKey.startsWith(`${userId}/temp-uploads/`)) {
            console.warn(
              `Attempted to move a file from an invalid key: ${tempKey}`
            );
            throw new Error(
              "An unexpected error occurred, Please create a new post"
            ); // throw an error for this key to prevent malicious moves
          }

          const fileName = path.basename(tempKey);
          const permanentKey = `${userId}/posts/${sessionId}/${fileName}`; // The final destination

          console.log(`Copying ${tempKey} to ${permanentKey}`);

          // 1. Copy the object from temp to permanent folder
          const copyCommand = new CopyObjectCommand({
            Bucket: SPACES_BUCKET,
            CopySource: `${SPACES_BUCKET}/${tempKey}`,
            Key: permanentKey,
            ACL: "public-read",
          });

          await s3Config.send(copyCommand);
          file.key = permanentKey;
          file.url = file.url.replace(tempKey, permanentKey);

          console.log(`Successfully copied ${tempKey}`);
        })
      );

      const newPost = await postService.createPost({
        userId,
        files,
        postId: sessionId,
        caption,
      });

      // You might also want to delete the entire temp session folder for good measure
      // after all files are moved. This is optional.
      await deleteFolderByPrefix(sessionPrefix);
      console.log(`Cleared temporary session folder: ${sessionPrefix}`);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: newPost,
        message: "Post created successfully",
      });
    },
  ];

  getPreSignedUrl = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const { fileName, fileType, sessionId } = req.body;

    if (!fileName || !fileType || !userId || !sessionId) {
      throw new ErrorResponse(
        "fileName, fileType, sessionId, and userId are required.",
        HttpStatusCode.BadRequest
      );
    }

    // Generate a unique filename to prevent collisions and duplicates in the S3 bucket
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const tempS3Key = `${userId}/temp-uploads/${sessionId}/${uniqueFileName}`;

    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: tempS3Key,
      ContentType: fileType,
      // You can add metadata here to be stored with the object in S3
      Metadata: {
        "x-amz-meta-original-name": fileName,
        "x-amz-meta-user-id": userId,
        "x-amz-meta-session-id": sessionId,
      },
    });

    // Generate the presigned URL with a limited expiration time (e.g., 60 minutes)
    const expiresIn = 60 * 60; // 60 minutes
    const presignedUrl = await getSignedUrl(s3Config, command, { expiresIn });

    res.status(200).json({
      message: "Post session initialized successfully!",
      data: {
        url: presignedUrl,
        key: tempS3Key,
      },
    });
  };

  initializePostSession = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const data = await postService.initializePostSession(userId);

    res.status(201).json({
      message: "Post session initialized successfully!",
      data: {
        sessionId: data?.sessionId,
      },
    });
  };

  getMyPosts = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const { posts: data, pagination } = await postService.getMyPosts(
      userId,
      req.query
    );

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      pagination,
      message: "Posts fetched successfully",
    });
  };

  getUserPosts = async (req: Request, res: Response) => {
    const loggedInUser = req?.user?.id;
    const userId = req?.params?.id;

    const { posts: data, pagination } = await postService.getUserPosts(
      loggedInUser,
      userId,
      req.query
    );

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      pagination,
      message: "Posts fetched successfully",
    });
  };

  getPostById = async (req: Request, res: Response) => {
    const userId = req?.user?.id ?? "";
    const postId = req?.params?.id ?? "";

    const post = await postService.getPostById({
      userId,
      postId,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: post,
      message: "Post fetched successfully",
    });
  };

  getPostsByHashtag = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const hashtag = String(req.query?.hashtag ?? "").replace(/#/g, "");

    const { posts: data, pagination } = await postService.getHashtagPosts({
      userId,
      hashtag,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      pagination,
      message: `Hashtag:(${hashtag}) Posts fetched successfully`,
    });
  };

  getFollowingPosts = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const { posts: data, pagination } = await postService.getFeed(
      userId,
      req.query,
      "following"
    );

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      pagination,
      message: "Posts fetched successfully",
    });
  };

  getSpotlightPosts = async (req: Request, res: Response) => {
    const userId = req?.user?.id;

    const { posts: data, pagination } = await postService.getFeed(
      userId,
      req.query,
      "spotlight"
    );

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      pagination,
      message: "Posts fetched successfully",
    });
  };

  // REPORT
  reportAPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const postId = req.params?.postId;

    const data = await postService.reportPost(
      userId,
      postId,
      req.body?.reason ?? ""
    );

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Post reported successfully",
    });
  };

  // LIKES
  likeAPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const postId = req.params?.postId;

    const data = await postService.likePost(userId, postId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Post liked successfully",
    });
  };

  unlikeAPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const postId = req.params?.postId;

    const data = await postService.unlikePost(userId, postId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Post unliked successfully",
    });
  };

  getPostLikes = async (req: Request, res: Response) => {
    const postId = req.params?.postId;

    const data = await postService.getPostLikes(postId);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Likes fetched successfully",
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

  // COMMENTS
  getPostComments = async (req: Request, res: Response) => {
    const userId = req?.user?.id ?? "";
    const postId = req.params?.postId ?? "";

    const data = await postService.getPostComments({
      userId,
      postId,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Comments fetched successfully",
    });
  };

  getPostCommentReplies = async (req: Request, res: Response) => {
    const userId = req?.user?.id ?? "";
    const postId = req.params?.postId ?? "";
    const commentId = req.params?.commentId ?? "";

    const data = await postService.getPostCommentReplies({
      userId,
      postId,
      commentId,
      ...req.query,
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data,
      message: "Comments replies fetched successfully",
    });
  };

  commentOnPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const postId = req.params?.postId;
    const { comment: message } = req.body;

    const comment = await postService.commentOnPost(userId, postId, message);

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: comment,
      message: "Comment added successfully",
    });
  };

  replyToComment = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const postId = req.params?.postId;
    const commentId = req.params?.commentId;
    const comment = req.body?.comment ?? "";

    const reply = await postService.replyToComment({
      userId,
      postId,
      parentCommentId: commentId,
      comment,
    });

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: reply,
      message: "Reply added successfully",
    });
  };

  likeAComment = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const commentId = req.params?.commentId;

    const reply = await postService.likeAComment(userId, commentId);

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: reply,
      message: "Comment liked successfully",
    });
  };

  unlikeAComment = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const commentId = req.params?.commentId;

    const reply = await postService.unlikeAComment(userId, commentId);

    res.status(HttpStatusCode.Created).json({
      success: true,
      data: reply,
      message: "Comment unliked successfully",
    });
  };
}

export const postController = new PostController();
