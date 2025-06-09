import { interestController } from "@/controllers/interest.controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { Router } from "express";

export const topicRouter = Router();

// TOPICS
topicRouter.get(
  "/topic/all",
  authMiddleWare.protectRoute,
  interestController.getAllTopics
);

topicRouter.get(
  "/topic/my-topics",
  authMiddleWare.protectRoute,
  interestController.getUserSelectedTopics
);

topicRouter.get(
  "/topic/not-following",
  authMiddleWare.protectRoute,
  interestController.getUserUnSelectedTopics
);

topicRouter.post(
  "/topic/follow",
  authMiddleWare.protectRoute,
  interestController.addUserInterests
);

topicRouter.post(
  "/topic/follow",
  authMiddleWare.protectRoute,
  interestController.addUserInterests
);

// HASHTAGS
topicRouter.post(
  "/hashtag/follow",
  authMiddleWare.protectRoute,
  interestController.followHashtags
);

topicRouter.get(
  "/hashtags/my-topics", // user query instead
  authMiddleWare.protectRoute,
  interestController.getUserTopicHashtags
);

topicRouter.get(
  "/hashtags", // user query instead
  authMiddleWare.protectRoute,
  interestController.getTopicHashtags
);
