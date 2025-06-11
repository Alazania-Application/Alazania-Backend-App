import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { hashtagService, topicService } from "@/services";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";
import { body, query } from "express-validator";
import slugify from "slugify";

class InterestController {
  getAllTopics = [
    async (req: Request, res: Response) => {
      const topics = await topicService.getAllTopics(req.query);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: topics,
        message: "Topics fetched successfully",
      });
    },
  ];

  getUserSelectedTopics = [
    async (req: Request, res: Response) => {
      const topics = await topicService.getUserTopics(req?.user?.id, req.query);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: topics,
        message: "Topics fetched successfully",
      });
    },
  ];

  getUserUnSelectedTopics = [
    async (req: Request, res: Response) => {
      const topics = await topicService.getUserUnselectedTopics(
        req?.user?.id,
        req.query
      );

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: topics,
        message: "Topics fetched successfully",
      });
    },
  ];

  addUserInterests = [
    ValidatorMiddleware.inputs([
      body("topics", "Please provide topics").exists().isArray(),
      body("topics.*", "Each topic must be a string").exists().isString(),
    ]),

    async (req: Request, res: Response) => {
      const topics = req.body.topics as string[] | string;

      const topicsArray = (
        Array.isArray(topics) ? topics : topics?.split(",")
      ).map((v) =>
        slugify(v, {
          trim: true,
          lower: true,
        })
      );

      const result = await topicService.addUserInterests(
        req?.user?.id,
        topicsArray as string[]
      );

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: result,
        message: "Topic(s) added successfully",
      });
    },
  ];

  followHashtags = [
    ValidatorMiddleware.inputs([
      body("hashtags", "Please provide hashtags").exists().isArray(),
      body("hashtags.*", "Each hashtag must be a string").exists().isString(),
    ]),

    async (req: Request, res: Response) => {
      const hashtagsArray = req.body.hashtags.map((v: string) =>
        slugify(v, {
          trim: true,
          lower: true,
        })
      );

      const result = await hashtagService.followHashtags(
        req?.user?.id,
        hashtagsArray as string[]
      );

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: result,
        message: "Hashtags(s) followed successfully",
      });
    },
  ];

  getTopicHashtags = [
    ValidatorMiddleware.inputs([
      query("topics")
        .exists()
        .withMessage("Please provide topics")
        .isString()
        .withMessage("Topics must be a comma-separated string")
        .customSanitizer((value) => value.split(",")),

      query("topics.*").isString().withMessage("Each topic must be a string"),
    ]),

    async (req: Request, res: Response) => {
      const topics = req.query.topics as string[] | string;
      const topicsArray =
        (Array.isArray(topics) ? topics : topics?.split(",")).map((v) =>
          slugify(v, {
            trim: true,
            lower: true,
          })
        ) || [];

      const query = { ...req.query, topicSlugs: topicsArray };

      const result = await hashtagService.getHashtagsByTopic(query);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: result,
        message: "Hashtags fetched successfully",
      });
    },
  ];

  getUserTopicHashtags = [
    async (req: Request, res: Response) => {
      const query = {
        ...req.query,
        topicSlugs: [],
        userId: req.user?.id,
      };

      const result = await hashtagService.getHashtagsByTopic(query);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: result,
        message: "Hashtags fetched successfully",
      });
    },
  ];

  getTrendingHashtags = [
    async (req: Request, res: Response) => {
      const query = {
        ...req.query,
        userId: req.user?.id,
      };

      const result = await hashtagService.getTrendingHashtags(query);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: result,
        message: "Hashtags fetched successfully",
      });
    },
  ];
}

export const interestController = new InterestController();
