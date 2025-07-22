import { body, query } from "express-validator";
import ValidatorMiddleware from "./validator.middleware";

class InterestValidator extends ValidatorMiddleware {
  validateTopic = this.inputs([body("name")]);
  validateTopics = this.inputs([
    body("topics", "Please provide topics").notEmpty().isArray(),
    body("topics.*", "Each topic must be a string").notEmpty().isString(),
  ]);
  validateHashtags = this.inputs([
    body("hashtags", "Please provide hashtags").notEmpty().isArray(),
    body("hashtags.*", "Each hashtag must be a string").notEmpty().isString(),
  ]);

  validateGetTopic = this.inputs([
    query("topics")
      .notEmpty()
      .withMessage("Please provide topics")
      .isString()
      .withMessage("Topics must be a comma-separated string")
      .customSanitizer((value) => value.split(",")),

    query("topics.*").isString().withMessage("Each topic must be a string"),
  ]);
}

export const interestValidator = new InterestValidator();
