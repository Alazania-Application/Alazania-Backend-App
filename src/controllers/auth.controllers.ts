import { NextFunction, Request, Response } from "express";
import axios, { HttpStatusCode } from "axios";
import { authService, emailService, userService } from "@/services";
import { ErrorResponse, getError, isIdToken } from "@/utils";
import { IUser } from "@/models";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_WEB_CLIENT_REDIRECT,
  REFRESH_TOKEN_SECRET,
  USER_TOKEN,
} from "@/config";
import { URLSearchParams } from "url";

class AuthController {
  registerUser = [
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

  resendEmailVerificationMail = async (req: Request, res: Response) => {
    const user = await userService.getUserByQuery(req.body.username);
    await authService.sendEmailVerification(user);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      message: "Email sent successfully",
    });
  };

  /**
   * Logs in a user
   */
  loginUser = async (req: Request, res: Response) => {
    const user = await authService.loginUser(req.body);

    return authService.sendTokenResponse(user, HttpStatusCode.Ok, res);
  };

  /**
   * Logs in a user
   */
  refreshToken = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[USER_TOKEN];

    if (!refreshToken)
      throw new ErrorResponse(
        "Invalid or expired token",
        HttpStatusCode.Unauthorized
      );

    try {
      const decode = authService.verifyAuthToken(
        refreshToken,
        REFRESH_TOKEN_SECRET
      );

      // @ts-ignore
      req.id = decode.id;
      let user: IUser | null;

      user = await userService.getUserById(req.id);

      if (!user) {
        throw new ErrorResponse(
          "Invalid or expired token",
          HttpStatusCode.Forbidden
        );
      }

      req.user = user;

      return authService.refreshToken(user, HttpStatusCode.Ok, res);
    } catch (err) {
      throw new ErrorResponse(
        "Invalid or expired token",
        HttpStatusCode.Forbidden
      );
    }
  };

  // @desc      Forgot password
  // @route     POST /api/v1/auth/user/forgot-password
  // @access    Public
  forgotUserPassword = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    await authService.sendUserResetPasswordToken(req.body.username);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      message:
        "Instructions on how to reset your account password has been sent to your mail it exist",
    });
  };

  // @desc      Reset password
  // @route     PATCH /api/v1/auth/user/reset-password
  // @access    Public
  resetUserPassword = async (req: Request, res: Response) => {
    await authService.resetPassword(req.body);

    res.status(HttpStatusCode.Ok).json({
      success: true,
      message: "Password reset successfully",
    });
  };

  // @desc      Verify email
  // @route     PATCH /api/v1/auth/user/verify
  // @access    Public
  verifyUserEmail = async (req: Request, res: Response) => {
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
  };

  // @desc      Google AUTH
  // @route     POST /api/v1/auth/user/google
  // @access    Public
  googleAuth = async (req: Request, res: Response) => {
    const token = req?.body?.token;

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

      user = (await authService.createGoogleUser(userData)) as IUser;
    }

    if (!user?.isEmailVerified && email_verified) {
      user = await authService.verifyUserEmail(email);
    }

    return authService.sendTokenResponse(user, 200, res);
  };

  // @desc      Google AUTH Web
  // @route     GET /api/v1/auth/user/initiate-google-auth
  // @access    Public
  initiateGoogleAuth = async (_: Request, res: Response) => {
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
  googleCallback = async (req: Request, res: Response) => {
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

    const { data } = await axios
      .post(`https://oauth2.googleapis.com/token`, config, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
      .catch((error) => {
        console.error({ error: error?.response?.data });
        throw new Error(getError(error));
      });

    const { id_token } = data;

    const verificationResponse = await authService.verifyGoogleIdToken(
      id_token
    );

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
    }

    if (!user?.isEmailVerified && email_verified) {
      user = await authService.verifyUserEmail(email);
    }

    return authService.sendTokenResponse(user, 200, res);
  };
}

export const authController = new AuthController();
