import { body, param } from "express-validator";
import ValidatorMiddleware from "./validator.middleware";

class UserValidator extends ValidatorMiddleware {
  validateUpload = ValidatorMiddleware.dynamicFieldValidator;
  validateUserId = this.inputs([
    param("userId", "A valid User id is required").notEmpty().isUUID(),
  ]);

  validateUpdate = this.inputs([
    body(
      "username",
      "Username must be 3-20 characters, alphanumeric, start with a letter, and may contain _-."
    )
      .optional()
      .isString()
      .isLength({ min: 3, max: 20 })
      .matches(/^[A-Za-z][A-Za-z0-9_\-\.]*$/),
    body("bio", "bio must be between 0-125 characters")
      .optional()
      .isString()
      .isLength({ min: 0, max: 125 }),
  ]);

  validateOnboardUpdate = this.inputs([
    body(
      "username",
      "Username must be 3-20 characters, alphanumeric, start with a letter, and may contain _-."
    )
      .optional()
      .isString()
      .isLength({ min: 3, max: 20 })
      .matches(/^[A-Za-z][A-Za-z0-9_\-\.]*$/),
    body("topics", "Please provide topics").optional().isArray(),
    body("topics.*", "Each topic must be a string").notEmpty().isString(),
    body("hashtags", "Please provide hashtags").optional().isArray(),
    body("hashtags.*", "Each hashtag must be a string").notEmpty().isString(),
  ]);
}

export const userValidator = new UserValidator();
