import { authController } from "@/controllers";
import { Router } from "express";

export const authRouter = Router();

authRouter.post("/register-user", authController.registerUser);
authRouter.post("/login-user", authController.loginUser);
