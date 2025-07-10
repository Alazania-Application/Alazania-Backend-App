import { authController } from "@/controllers";
import { Router } from "express";

export const authRouter = Router();

// USER AUTH ROUTES
authRouter.get("/user/refresh-token", authController.refreshToken);
authRouter.post("/user/register", authController.registerUser);
authRouter.post("/user/login", authController.loginUser);
authRouter.post("/user/forgot-password", authController.forgotUserPassword);
authRouter.patch("/user/reset-password", authController.resetUserPassword);
authRouter.patch("/user/verify", authController.verifyUserEmail);
authRouter.post("/user/resend-verification-email", authController.resendEmailVerificationMail);
authRouter.get("/user/google", authController.googleAuth)

// GOOGLE AUTH WEB 
authRouter.get("/user/initiate-google-auth", authController.initiateGoogleAuth);
authRouter.get("/user/google-callback", authController.googleCallback);
