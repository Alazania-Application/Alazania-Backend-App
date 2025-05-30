import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { topicService } from "@/services";
import { getPaginationFilters } from "@/utils";
import { HttpStatusCode } from "axios";
import { Request, Response, NextFunction } from "express";
import { body } from "express-validator";

class InterestController {
  getAllTopics = [
    ValidatorMiddleware.inputs(ValidatorMiddleware.paginationFilters()),
    async (req: Request, res: Response, next: NextFunction) => {
      const query = getPaginationFilters(req);
      const topics = await topicService.getAllTopics(query);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: topics,
        message: "Topics fetched successfully",
      });
    },
  ];

  getUserSelectedTopics = [
    ValidatorMiddleware.inputs(ValidatorMiddleware.paginationFilters()),
    async (req: Request, res: Response, next: NextFunction) => {
      const query = getPaginationFilters(req);
      const topics = await topicService.getUserTopics(req?.user?.id, query);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        data: topics,
        message: "Topics fetched successfully",
      });
    },
  ];

  getUserUnSelectedTopics = [
    ValidatorMiddleware.inputs(ValidatorMiddleware.paginationFilters()),
    async (req: Request, res: Response, next: NextFunction) => {
      const query = getPaginationFilters(req);
      const topics = await topicService.getUserUnselectedTopics(
        req?.user?.id,
        query
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

    async (req: Request, res: Response, next: NextFunction) => {
      const topics: string[] = req.body?.topics || [];
      const result = await topicService.addUserInterests(req?.user?.id, topics);

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: result,
        message: "Topic(s) added successfully",
      });
    },
  ];
}

export const interestController = new InterestController();
