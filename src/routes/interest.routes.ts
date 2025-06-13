import { interestController } from "@/controllers/interest.controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { Router } from "express";

export const interestRouter = Router();

// TOPICS
interestRouter.get(
  "/topic/all",
  authMiddleWare.protectRoute,
  interestController.getAllTopics
);

interestRouter.get(
  "/topic/my-topics",
  authMiddleWare.protectRoute,
  interestController.getUserSelectedTopics
);

interestRouter.get(
  "/topic/not-following",
  authMiddleWare.protectRoute,
  interestController.getUserUnSelectedTopics
);

interestRouter.post(
  "/topic/follow",
  authMiddleWare.protectRoute,
  interestController.addUserInterests
);

interestRouter.post(
  "/topic/follow",
  authMiddleWare.protectRoute,
  interestController.addUserInterests
);

// HASHTAGS
interestRouter.post(
  "/hashtag/follow",
  authMiddleWare.protectRoute,
  interestController.followHashtags
);

interestRouter.get(
  "/hashtags/my-topics",
  authMiddleWare.protectRoute,
  interestController.getUserTopicHashtags
);

interestRouter.get(
  "/hashtags/trending",
  authMiddleWare.protectRoute,
  interestController.getTrendingHashtags
);

interestRouter.get(
  "/hashtags", // user query instead
  authMiddleWare.protectRoute,
  interestController.getTopicHashtags
);
