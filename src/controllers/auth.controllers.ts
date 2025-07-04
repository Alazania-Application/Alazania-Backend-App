import { NextFunction, Request, Response } from "express";
import axios, { HttpStatusCode } from "axios";
import { authService, emailService, userService } from "@/services";
import ValidatorMiddleware from "@/middlewares/validator.middleware";
import { body } from "express-validator";
import { ErrorResponse, getError, isIdToken } from "@/utils";
import { IUser } from "@/models";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_WEB_CLIENT_REDIRECT,
} from "@/config";
import { URLSearchParams } from "url";

class AuthController {
  registerUser = [
    /* #swagger.tags = ['Auth'] */
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
    ]),
    emailService.isValidEmail,
    authService.isEmailValidAndAvailable,
    async (req: Request, res: Response) => {
      const { email, password } = req.body;
      if (!email || !password) {
        throw new ErrorResponse(
          "Email and password are required",
          HttpStatusCode.BadRequest
        );
      }
      const hashedPassword = await authService.hashPassword(password);
      const payload = {
        email: email.toLowerCase(),
        password: hashedPassword,
      };
      const user = await authService.createUser(payload);

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
  resendEmailVerificationMail = [
    ValidatorMiddleware.inputs([
      body("username", "Email/Username/Phone is required").exists().isString(),
    ]),
    async (req: Request, res: Response, next: NextFunction) => {
      const user = await userService.getUserByQuery(req.body.username);
      await authService.sendEmailVerification(user);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        message: "Email sent successfully",
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

  // @desc      Forgot password
  // @route     POST /api/v1/auth/user/forgot-password
  // @access    Public
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

  // @desc      Reset password
  // @route     PATCH /api/v1/auth/user/reset-password
  // @access    Public
  resetUserPassword = [
    ValidatorMiddleware.inputs([
      body("username", "Email/Username/Phone is required").exists().isString(),
      body("password", "Password is required")
        .exists()
        .isLength({ min: 8, max: 50 })
        .withMessage("Password must be between 8 and 50 characters long.")
        .matches(/^(?=.*[a-zA-Z])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
        .withMessage(
          "Password must contain at least one alphabet character and one special character (@$!%*?&)."
        ),
      body("otp", "OTP is required")
        .exists()
        .isLength({ min: 6, max: 6 })
        .withMessage("Invalid OTP"),
    ]),

    async (req: Request, res: Response, next: NextFunction) => {
      await authService.resetPassword(req.body);

      res.status(HttpStatusCode.Ok).json({
        success: true,
        message: "Password reset successfully",
      });
    },
  ];

  // @desc      Verify email
  // @route     PATCH /api/v1/auth/user/verify
  // @access    Public
  verifyUserEmail = [
    ValidatorMiddleware.inputs([
      body("username", "Email/Username/Phone is required").exists().isString(),
      body("otp", "OTP is required")
        .exists()
        .isLength({ min: 6, max: 6 })
        .withMessage("Invalid OTP"),
    ]),

    async (req: Request, res: Response, next: NextFunction) => {
      const user = await userService.getUserByQuery(req.body.username);

      if (!user) {
        throw new ErrorResponse("User not found", HttpStatusCode.BadRequest);
      }
      if (user?.isEmailVerified) {
        throw new ErrorResponse(
          "Account already verified",
          HttpStatusCode.BadRequest
        );
      }

      await authService.verifyUserEmail(user.email, { otp: req.body.otp });

      res.status(HttpStatusCode.Ok).json({
        success: true,
        message: "Account verified successfully",
      });
    },
  ];

  // @desc      Google AUTH
  // @route     GET /api/v1/auth/user/google
  // @access    Public
  googleAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = req?.body?.credential;
    if (!token) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }
    let profile = null;

    if (isIdToken(token)) {
      // Verify ID Token
      const verificationResponse = await authService.verifyGoogleIdToken(token);

      profile = verificationResponse.payload;
    } else {
      // Verify Access Token
      const verificationResponse = await authService.verifyGoogleAccessToken(
        token
      );

      profile = verificationResponse.payload;
    }

    if (!profile) {
      throw new ErrorResponse(
        "Could not retrieve user profile, please try again",
        HttpStatusCode.BadRequest
      );
    }
    const { email_verified, given_name, sub, family_name, email, picture } =
      profile;

    let user: IUser = await userService.getUserByQuery(email);

    if (!user) {
      const userData: Partial<IUser> = {
        email,
        googleIdToken: sub,
        isEmailVerified: email_verified,
      };

      if (given_name) {
        userData.firstName = given_name;
      }
      if (family_name) {
        userData.lastName = family_name;
      }
      if (picture) {
        userData.avatar = picture;
      }

      user = (await authService.createGoogleUser({ ...userData })) as IUser;
    }

    if (!user?.isEmailVerified && email_verified) {
      user = await authService.verifyUserEmail(email);
    }

    return authService.sendTokenResponse(user, 200, res);
  };

  // @desc      Google AUTH Web
  // @route     GET /api/v1/auth/user/initiate-google-auth
  // @access    Public
  initiateGoogleAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const config = {
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_WEB_CLIENT_REDIRECT,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    };
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(config)) {
      queryParams.set(key, String(value));
    }
    const redirectUri =
      "https://accounts.google.com/o/oauth2/v2/auth?" + queryParams.toString();

    res.redirect(redirectUri);
  };

  // @desc      Google AUTH Callback
  // @route     GET /api/v1/auth/user/google-callback
  // @access    Public
  googleCallback = async (req: Request, res: Response, next: NextFunction) => {
    const code = req.query?.code as string;

    if (!code) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }

    const config = {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: GOOGLE_WEB_CLIENT_REDIRECT,
      grant_type: "authorization_code",
    };

    console.log("Google auth config::: ",{config})
    console.log("REDIRECT URI::: ",{GOOGLE_WEB_CLIENT_REDIRECT})

    const { data } = await axios
      .post(`https://oauth2.googleapis.com/token`, config, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
      .catch((error) => {
        console.error({ error: error?.response?.data });
        throw new Error(getError(error));
      });

      console.log("Data from auth::: ",{data})

    const { id_token } = data;

    const verificationResponse = await authService.verifyGoogleIdToken(
      id_token
    );

    console.log({verificationResponse})

    const profile = verificationResponse?.payload;

    if (!profile) {
      throw new ErrorResponse(
        "Could not retrieve user profile, please try again",
        HttpStatusCode.BadRequest
      );
    }

    const { email_verified, given_name, sub, family_name, email, picture } =
      profile;

    if (!email) {
      throw new ErrorResponse(
        "Could not retrieve user profile, please try again",
        HttpStatusCode.BadRequest
      );
    }

    let user: IUser = await userService.getUserByQuery(email as string);
    console.log("User 1" ,{user})

    if (!user) {
      const userData: Partial<IUser> = {
        email,
        googleIdToken: sub,
        isEmailVerified: email_verified,
      };

      if (given_name) {
        userData.firstName = given_name;
      }
      if (family_name) {
        userData.lastName = family_name;
      }
      if (picture) {
        userData.avatar = picture;
      }

      user = await authService.createGoogleUser({ ...userData });
      console.log("User 2" ,{user})
    }

    if (!user?.isEmailVerified && email_verified) {
      user = await authService.verifyUserEmail(email);
      console.log("Verified User 3" ,{user})
    }

   

    return authService.sendTokenResponse(user, 200, res);
  };
}

export const authController = new AuthController();
