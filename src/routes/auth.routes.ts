import { authController } from "@/controllers";
import { Router } from "express";

export const authRouter = Router();

// USER AUTH ROUTES
authRouter.post("/user/register", authController.registerUser);
authRouter.post("/user/login", authController.loginUser);
authRouter.post("/user/forgot-password", authController.forgotUserPassword);
authRouter.patch("/user/reset-password", authController.resetUserPassword);
