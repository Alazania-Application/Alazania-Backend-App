import { Router } from "express";
import { authMiddleWare } from "@/middlewares/authenticator.middleware";
import { postController } from "@/controllers";

export const postRouter = Router();

postRouter.get(
  "/following",
  authMiddleWare.protectRoute,
  postController.following
);

postRouter.get(
  "/spotlight",
  authMiddleWare.protectRoute,
  postController.spotlight
);


