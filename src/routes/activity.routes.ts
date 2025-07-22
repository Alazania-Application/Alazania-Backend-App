import { activityController } from "@/controllers";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { Router } from "express";

export const activityRouter = Router();

activityRouter.get(
  "/",
  authMiddleWare.protectRoute,
  activityController.getActivities
);
