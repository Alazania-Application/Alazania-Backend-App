import { SPACES_BUCKET } from "@/config";
import {
  deleteFolderByPrefix,
  s3Config,
  uploadFile,
} from "@/middlewares/upload.middleware";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { postService } from "@/services";
import { ErrorResponse } from "@/utils";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpStatusCode } from "axios";
import { NextFunction, Request, Response } from "express";
import { body, param, query } from "express-validator";
import path from "path";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

class PostController {
  createPost = async (req: Request, res: Response) => {
    const userId = req?.user?.id;
    const postId = uuidv4();
    req.body.postId = postId;

    const images = req.files as Express.Multer.File[];

    if (images?.length) {
      const compressedImages = await Promise.all(
        images.map((file) =>
          sharp(file.buffer)
            .resize({ width: 1080 })
            .webp({ quality: 80 })
            .toBuffer()
        )
      );

      const uploadUrls = await Promise.all(
        compressedImages.map((compressed) => {
          const filename = `${userId}/posts/${postId}/${uuidv4()}.webp`;
          return uploadFile(compressed, filename);
        })
      );

      req.body.images = [...uploadUrls];
    }

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

  publishPost = [
    ValidatorMiddleware.inputs([
      body("fileKeys", "fileKeys array is required").exists().isArray(),
      body("fileKeys.*", "fileKey is supposed to be a string")
        .exists()
        .isString(),
      body("postId", "postId is required").exists().isUUID(),
      body("sessionId", "sessionId is required").exists().isUUID(),
      body("content", "content is required").exists().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req.user?.id;
      const { postId, sessionId, fileKeys } = req.body;

      const modifiedPostId = `${userId}-${postId}`;
      const modifiedSessionId = `${userId}-${sessionId}`;
      const sessionPrefix = `${userId}/temp-uploads/${modifiedSessionId}/`;

      const successfulMoves: string[] = [];

      for (const tempKey of fileKeys) {
        // Security check: Ensure the key starts with the temporary prefix
        if (!tempKey.startsWith(`${userId}/temp-uploads/`)) {
          console.warn(
            `Attempted to move a file from an invalid key: ${tempKey}`
          );
          continue; // Skip this key to prevent malicious moves
        }

        const fileName = path.basename(tempKey);
        const permanentKey = `${userId}/posts/${modifiedPostId}/${fileName}`; // The final destination

        console.log(`Copying ${tempKey} to ${permanentKey}`);

        // 1. Copy the object from temp to permanent folder
        const copyCommand = new CopyObjectCommand({
          Bucket: SPACES_BUCKET,
          CopySource: `${SPACES_BUCKET}/${tempKey}`, // Must be in the format `bucket/key`
          Key: permanentKey,
        });

        await s3Config.send(copyCommand);
        successfulMoves.push(permanentKey);

        console.log(`Successfully copied ${tempKey}`);

        // 2. Delete the original object from the temporary folder
        const deleteCommand = new DeleteObjectCommand({
          Bucket: SPACES_BUCKET,
          Key: tempKey,
        });

        await s3Config.send(deleteCommand);
        console.log(`Deleted original temp file ${tempKey}`);
      }

      // You might also want to delete the entire temp session folder for good measure
      // after all files are moved. This is optional.

      await deleteFolderByPrefix(sessionPrefix);
      console.log(`Cleared temporary session folder: ${sessionPrefix}`);

      res.status(200).json({
        message: "Post published and files moved successfully!",
        permanentKeys: successfulMoves,
      });
    },
  ];

  getPreSignedUrl = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req?.user?.id;
    const { fileName, fileType, sessionId, postId } = req.body;

    if (!fileName || !fileType || !userId || !sessionId || !postId) {
      throw new ErrorResponse(
        "fileName, fileType, sessionId, postId, and userId are required.",
        HttpStatusCode.BadRequest
      );
    }

    const modifiedSessionId = `${userId}-${sessionId}`;

    // Generate a unique filename to prevent collisions and duplicates in the S3 bucket
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `/posts/${uuidv4()}${fileExtension}`;
    const tempS3Key = `${userId}/temp-uploads/${modifiedSessionId}/${uniqueFileName}`;

    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: tempS3Key,
      ContentType: fileType,
      // You can add metadata here to be stored with the object in S3
      Metadata: {
        "x-amz-meta-original-name": fileName,
        "x-amz-meta-user-id": userId,
        "x-amz-meta-session-id": modifiedSessionId,
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

  initializePostSession = [
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const data = await postService.initializePostSession(userId);

      res.status(201).json({
        message: "Post session initialized successfully!",
        data,
      });
    },
  ];

  getPosts = [
    ValidatorMiddleware.inputs([
      query("type", "type must either be 'spotlight' or 'following'")
        .optional()
        .isIn(["spotlight", "following"])
        .withMessage("type must be either 'spotlight' or 'following'"),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const type = (String(req.query?.type).trim().toLowerCase() ||
        "following") as "spotlight" | "following";

      // TODO: determine type of posts to show based on selected type

      const data = await postService.getFeed(userId, req.query, type);

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
