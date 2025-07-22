import { interestController } from "@/controllers/interest.controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { interestValidator } from "@/middlewares/validators";
import { Router } from "express";

export const interestRouter = Router();

// TOPICS
interestRouter.post(
  "/topic",
  authMiddleWare.protectRoute,
  interestValidator.validateTopic,
  interestController.createTopic
);

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
  interestValidator.validateTopics,
  interestController.addUserInterests
);

interestRouter.post(
  "/topic/unfollow",
  authMiddleWare.protectRoute,
  interestValidator.validateTopics,
  interestController.removeUserInterests
);

// HASHTAGS
interestRouter.post(
  "/hashtag/follow",
  authMiddleWare.protectRoute,
  interestValidator.validateHashtags,
  interestController.followHashtags
);

interestRouter.post(
  "/hashtag/unfollow",
  authMiddleWare.protectRoute,
  interestValidator.validateHashtags,
  interestController.unfollowHashtags
);

interestRouter.get(
  "/hashtag/followed",
  authMiddleWare.protectRoute,
  interestController.getUserFollowedHashtags
);

interestRouter.get(
  "/hashtags/all",
  authMiddleWare.protectRoute,
  interestController.getAllHashtags
);

interestRouter.get(
  "/hashtags/my-topics",
  authMiddleWare.protectRoute,
  interestValidator.validateGetTopic,
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
