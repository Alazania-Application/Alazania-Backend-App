import ValidatorMiddleware from "./validator.middleware";
import { extractHashtags, extractMentions } from "@/utils";
import { body, CustomValidator, param, query } from "express-validator";

class PostValidator extends ValidatorMiddleware {
  // Custom validator for total photo tags
  private validateTotalPhotoTags: CustomValidator = (files, { req }) => {
    if (!Array.isArray(files)) {
      return true; // If files is not an array, other validators will catch it.
    }

    let totalTags = 0;
    for (const file of files) {
      if (file && Array.isArray(file.tags)) {
        totalTags += file.tags.length;
      }
    }

    if (totalTags > 20) {
      throw new Error(
        "A cumulative maximum of 20 photo tags is allowed for all files in a single post."
      );
    }
    return true;
  };

  // Custom validator for hashtags in caption
  private validateHashtagsInCaption: CustomValidator = (caption: string) => {
    if (typeof caption !== "string") {
      return true; // If caption is not a string, other validators will catch it.
    }
    const hashtags = extractHashtags(caption);
    if (hashtags.length > 30) {
      throw new Error("A maximum of 30 hashtags is allowed in the caption.");
    }
    return true;
  };

  // Custom validator for mentions in caption
  private validateMentionsInCaption: CustomValidator = (caption: string) => {
    if (typeof caption !== "string") {
      return true; // If caption is not a string, other validators will catch it.
    }
    const mentions = extractMentions(caption);
    if (mentions.length > 20) {
      throw new Error("A maximum of 20 mentions is allowed in the caption.");
    }
    return true;
  };

  validatePostCreation = this.inputs([
    body("files", "files must be an array")
      .optional()
      .isArray({ min: 1, max: 10 })
      .withMessage(
        "files must be an array with at least 1 and at most 10 files"
      ),
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
      .isUUID()
      .withMessage("Invalid User id"),
    body("files.*.tags.*.positionX", "positionX should be a number")
      .if(body("files.*.tags").notEmpty())
      .optional()
      .isNumeric(),
    body("files.*.tags.*.positionY", "positionY should be a number")
      .if(body("files.*.tags").notEmpty())
      .optional()
      .isNumeric(),
    body("files").optional().custom(this.validateTotalPhotoTags), //max of 20 tags
    body("sessionId", "sessionId is required").notEmpty(),
    body("caption", "caption is required")
      .notEmpty()
      .isString()
      .isLength({ max: 2200, min: 1 })
      .withMessage(
        "caption is required and must be a non-empty string between 1 and 2200 characters."
      )
      .custom(this.validateHashtagsInCaption) //max of 30 hashtags
      .custom(this.validateMentionsInCaption), // max of 20 mentions
  ]);

  validatePresignedUrl = this.inputs([
    body("fileName", "fileName string is required").isString(),
    body("sessionId", "sessionId is required").notEmpty().isString(),
    body("fileType", "fileType is required").notEmpty().isString(),
  ]);

  validateGetUserPosts = this.inputs([
    param("id", "user ID is required")
      .notEmpty()
      .isUUID()
      .withMessage("Invalid user ID"),
  ]);

  validatePostId = this.inputs([
    param("id", "Post ID is required")
      .notEmpty()
      .isUUID()
      .withMessage("Invalid post ID"),
  ]);
  validateCommentId = this.inputs([
    param("commentId", "commentId is required").notEmpty().isUUID(),
  ]);
  validatePostAndCommentId = this.inputs([
    param("postId", "postId is required").notEmpty().isUUID(),
    param("commentId", "commentId is required").notEmpty().isUUID(),
  ]);
  validateComment = this.inputs([
    param("postId", "postId is required").notEmpty().isUUID(),
    body("comment", "Cannot post an empty comment").notEmpty().isString(),
  ]);
  validateCommentReply = this.inputs([
    param("postId", "postId is required").notEmpty().isUUID(),
    param("commentId", "commentId is required").notEmpty().isUUID(),
    body("comment", "Cannot post an empty comment").notEmpty().isString(),
  ]);
  validateHashtag = this.inputs([
    query("hashtag", "hashtag is required").notEmpty().isString(),
  ]);
}

export const postValidator = new PostValidator();
