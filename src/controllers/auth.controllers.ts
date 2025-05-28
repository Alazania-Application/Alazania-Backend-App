import { NextFunction, Request, Response } from "express";
import { HttpStatusCode } from "axios";
import { authService, emailService } from "@/services";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { body } from "express-validator";

class AuthController {
  registerUser = [
    ValidatorMiddleware.inputs([
      body("email", "Please provide a valid email").exists().isEmail(),
      body("password", "Password is required")
        .exists()
        .isLength({ min: 8, max: 50 })
        .withMessage("Password must be between 8 and 50 characters long.")
        .matches(/^(?=.*[a-zA-Z])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
        .withMessage(
          "Password must contain at least one alphabet character and one special character (@$!%*?&)."
        ),
      // .matches(
      //   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/
      // )
      // .withMessage(
      //   "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (@$!%*?&)."
      // ),
    ]),
    emailService.isValidEmail,
    authService.isEmailValidAndAvailable,
    async (req: Request, res: Response) => {
      const { email, password } = req.body;
      const user = await authService.createUser({ email, password });
      // NOTE: send email verification link

      res.status(HttpStatusCode.Created).json({
        success: true,
        data: user,
        message: "Account created successfully",
      });
    },
  ];

  /**
   * Logs in a user
   */
  loginUser = [
    ValidatorMiddleware.inputs([
      body("username", "Email/Username/Phone is required").exists().isString(),
      body("password").exists().isString(),
    ]),
    async (req: Request, res: Response, next: NextFunction) => {
      const user = await authService.loginUser(req.body);

      return authService.sendTokenResponse(user, HttpStatusCode.Ok, res);
    },
  ];

  forgotUserPassword = [
    ValidatorMiddleware.inputs([
      body("username", "Email/Username/Phone is required").exists().isString(),
    ]),

    async (req: Request, res: Response, next: NextFunction) => {
      await authService.sendUserResetPasswordToken(req.body.username);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        message:
          "Instructions on how to reset your account password has been sent to your mail it exist",
      });
    },
  ];
}

export const authController = new AuthController();
