import { SPACES_BUCKET } from "@/config";
import {
  deleteFolderByPrefix,
  s3Config,
} from "@/middlewares/upload.middleware";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { IPostFile } from "@/models";
import { postService } from "@/services";
import { ErrorResponse } from "@/utils";
import {
  CopyObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";
import { body, param } from "express-validator";
import path from "path";
import { v4 as uuidv4 } from "uuid";

class PostController {
  // createPost = async (req: Request, res: Response) => {
  //   const userId = req?.user?.id;
  //   const postId = uuidv4();
  //   req.body.postId = postId;

  //   const images = req.files as Express.Multer.File[];

  //   if (images?.length) {
  //     const compressedImages = await Promise.all(
  //       images.map((file) =>
  //         sharp(file.buffer)
  //           .resize({ width: 1080 })
  //           .webp({ quality: 80 })
  //           .toBuffer()
  //       )
  //     );

  //     const uploadUrls = await Promise.all(
  //       compressedImages.map((compressed) => {
  //         const filename = `${userId}/posts/${postId}/${uuidv4()}.webp`;
  //         return uploadFile(compressed, filename);
  //       })
  //     );

  //     req.body.images = [...uploadUrls];
  //   }

  //   const payload = {
  //     ...req.body,
  //     userId,
  //   };

  //   const newPost = await postService.createPost(payload);

  //   res.status(HttpStatusCode.Created).json({
  //     success: true,
  //     data: newPost,
  //     message: "Post created successfully",
  //   });
  // };

  publishPost = [
    ValidatorMiddleware.inputs([
      body("files", "files must be an array").optional().isArray(),
      body("files.*.url", "url is required and must be a string")
        .if(body("files").notEmpty())
        .notEmpty()
        .isString(),
      body("files.*.key", "key is required and must be a string")
        .if(body("files").notEmpty())
        .notEmpty()
        .isString(),
      body("files.*.fileType", "fileType is required and must be a string")
        .if(body("files").notEmpty())
        .notEmpty()
        .isString(),
      body("files.*.tags", "tags is must be an array")
        .if(body("files").notEmpty())
        .optional()
        .isArray(),
      body("files.*.tags.*.userId", "User id is required for tags")
        .if(body("files.*.tags").notEmpty())
        .notEmpty()
        .isUUID().withMessage("Invalid User id"),
      body("files.*.tags.*.positionX", "positionX should be a number")
        .if(body("files.*.tags").notEmpty())
        .optional()
        .isNumeric(),
      body("files.*.tags.*.positionY", "positionY should be a number")
        .if(body("files.*.tags").notEmpty())
        .optional()
        .isNumeric(),
      body("sessionId", "sessionId is required").notEmpty(),
      body("caption", "caption is required")
        .notEmpty()
        .isString()
        .isLength({ max: 2200, min: 1 })
        .withMessage(
          "caption is required and must be a non-empty string between 1 and 2200 characters."
        ),
    ]),
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

  getPreSignedUrl = [
    ValidatorMiddleware.inputs([
      body("fileName", "fileName string is required").isString(),
      body("sessionId", "sessionId is required").notEmpty().isString(),
      body("fileType", "fileType is required").notEmpty().isString(),
    ]),

    async (req: Request, res: Response) => {
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
    },
  ];

  initializePostSession = [
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;

      const data = await postService.initializePostSession(userId);

      res.status(201).json({
        message: "Post session initialized successfully!",
        data: {
          sessionId: data?.sessionId
        },
      });
    },
  ];

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

  getUserPosts = [
    ValidatorMiddleware.inputs([
      param("id", "user ID is required")
        .notEmpty()
        .isUUID()
        .withMessage("Invalid user ID"),
    ]),
    async (req: Request, res: Response) => {
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
    },
  ];

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
  reportAPost = [
    ValidatorMiddleware.inputs([
      param("postId", "A valid postId is required").notEmpty().isUUID(),
    ]),
    async (req: Request, res: Response) => {
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
    },
  ];

  // LIKES
  likeAPost = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").notEmpty().isUUID(),
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
      param("postId", "postId is required").notEmpty().isUUID(),
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
      param("postId", "postId is required").notEmpty().isUUID(),
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
      param("postId", "postId is required").notEmpty().isUUID(),
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
      param("postId", "postId is required").notEmpty().isUUID(),
      body("comment", "Cannot post an empty comment").notEmpty().isString(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const postId = req.params?.postId;
      const { comment: message } = req.body;

      const comment = await postService.commentOnPost(userId, postId, message);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: comment,
        message: "Comment added successfully",
      });
    },
  ];

  replyToComment = [
    ValidatorMiddleware.inputs([
      param("postId", "postId is required").notEmpty().isUUID(),
      body("comment", "Cannot post an empty comment").notEmpty().isString(),
      body("parentCommentId", "parentCommentId is required").notEmpty().isUUID(),
    ]),
    async (req: Request, res: Response) => {
      const userId = req?.user?.id;
      const postId = req.params?.postId;
      const { comment, parentCommentId } = req.body;

      const reply = await postService.replyToComment(
        userId,
        postId,
        parentCommentId,
        comment
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
      param("commentId", "commentId is required").notEmpty().isUUID(),
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
      param("commentId", "commentId is required").notEmpty().isUUID(),
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
