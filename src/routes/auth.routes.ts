import { authController } from "@/controllers";
import { authValidator } from "@/middlewares/validators";
import { authService, emailService } from "@/services";
import { Router } from "express";

export const authRouter = Router();

// USER AUTH ROUTES
authRouter.post(
  "/user/register",
  authValidator.validateSignUp,
  emailService.isValidEmail,
  authService.isEmailValidAndAvailable,
  authController.registerUser
);
authRouter.post(
  "/user/resend-verification-email",
  authValidator.validateUsername,
  authController.resendEmailVerificationMail
);
authRouter.post(
  "/user/login",
  authValidator.validateLogin,
  authController.loginUser
);
authRouter.get("/user/refresh-token", authController.refreshToken);
authRouter.post(
  "/user/forgot-password",
  authValidator.validateUsername,
  authController.forgotUserPassword
);
authRouter.patch(
  "/user/reset-password",
  authValidator.validateReset,
  authController.resetUserPassword
);
authRouter.patch(
  "/user/verify",
  authValidator.validateVerifyUser,
  authController.verifyUserEmail
);
authRouter.post(
  "/user/google",
  authValidator.validateToken,
  authController.googleAuth
);

// GOOGLE AUTH WEB
authRouter.get("/user/initiate-google-auth", authController.initiateGoogleAuth);
authRouter.get("/user/google-callback", authController.googleCallback);
