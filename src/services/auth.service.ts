import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import BaseService from "./base.service";
import { CookieOptions, NextFunction, Request, Response } from "express";
import { IUser } from "@/models";
import {
  ErrorResponse,
  omitDTO,
  toDTO,
  verifyJwtToken,
} from "@/utils";
import { HttpStatusCode } from "axios";
import {
  env,
  GOOGLE_CLIENT_ID,
  JWT_COOKIE_EXPIRY,
  JWT_EXPIRY,
  JWT_KEY,
  USER_TOKEN,
} from "@/config";
import { emailRepository } from "@/repository/email.repository";
import { UserResponseDto } from "@/models/user.model";
import { otpService } from "./otp.service";
import { userService } from "./user.service";
import { OAuth2Client } from "google-auth-library";
import { NodeLabels } from "@/enums";

/**
 * Description placeholder
 *
 * @typedef {AuthPayload}
 */
type AuthPayload = { id?: string; email?: string };

/**
 * Description placeholder
 *
 * @class AuthService
 * @typedef {AuthService}
 * @extends {BaseService}
 */
class AuthService extends BaseService {
  /**
   * Checks and validates the password
   */
  private comparePassword = async (
    password: string,
    hashedPassword: string
  ): Promise<boolean> => {
    return bcrypt.compare(password, hashedPassword);
  };

  /**
   * Hashes a new user password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, bcrypt.genSaltSync(10));
  }

  // Find staff credentials
  /**
   * Description placeholder
   *
   * @private
   * @async
   * @param {{
   *       username: string;
   *       password: string;
   *     }} param0
   * @param {string} param0.username
   * @param {string} param0.password
   * @returns {Promise<UserResponseDto>}
   */
  private async findUserByCredentials(
    {
      username,
      password,
    }: {
      username: string;
      password: string;
    } // : Promise<User | undefined>
  ): Promise<UserResponseDto> {
    const result = await this.readFromDB(
      `
        MATCH (u:${NodeLabels.User})
        WHERE u.username = $username OR u.email = $username OR u.phone = $username
        RETURN u
        `,
      { username }
    );

    if (!result.records.length) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }

    const doc = result.records[0]?.get("u")?.properties as IUser;

    if (!doc) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }

    if (!doc?.password) {
      if (!doc?.googleIdToken) {
        throw new ErrorResponse(
          "Invalid credentials",
          HttpStatusCode.BadRequest
        );
      }
      throw new ErrorResponse(
        "No password set for this user, please login with Google",
        HttpStatusCode.BadRequest
      );
    }

    const isMatchPassword: boolean = await bcrypt.compare(
      password,
      doc.password
    );

    if (!isMatchPassword) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }

    const user = omitDTO(doc, ["password", "isDeleted"]);

    if (!user) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }

    if (user.createdAt && typeof user.createdAt.toString === "function") {
      user.createdAt = user.createdAt.toString();
    }

    return user;
  }

  /**
   * Generates a signed JWT token for the user
   * @returns {Promise<string>}
   */
  private getSignedJWT(user: IUser) {
    return jwt.sign({ id: user.id, email: user.email }, JWT_KEY, {
      expiresIn: JWT_EXPIRY,
    });
  }

  /**
   * Generates a signed JWT token for the user
   * @returns {Promise<string>}
   */
  // private getVerificationToken(user: IUser) {
  //   return jwt.sign({ id: user.id, email: user.email }, JWT_KEY, {
  //     expiresIn: VERIFICATION_TOKEN_EXPIRY,
  //   });
  // }

  /**
   * Verifies a jwt token
   * @param token
   */
  verifyJwtToken(token: string): AuthPayload {
    try {
      return verifyJwtToken(token, JWT_KEY) as AuthPayload;
    } catch (error) {
      throw new ErrorResponse(
        "Invalid or expired token",
        HttpStatusCode.BadRequest
      );
    }
  }

  // Get token from model, create cookie and send response
  /**
   * Description placeholder
   *
   * @async
   * @param {IUser} user
   * @param {number} statusCode
   * @param {Response} res
   * @returns {*}
   */
  sendTokenResponse = async (
    user: IUser,
    statusCode: number,
    res: Response
  ) => {
    // Create token
    const token = await this.getSignedJWT(user);
    /**
     * Cookie options for setting JWT token in the response.
     *
     * @type {CookieOptions}
     * @property {Date} expires - The expiration date of the cookie,
     * calculated based on the current date and the JWT cookie expiry duration.
     * @property {boolean} httpOnly - Indicates if the cookie is
     * accessible only through the HTTP protocol, not via JavaScript.
     */
    const options: CookieOptions = {
      // expires minutes in milliseconds
      expires: new Date(Date.now() + Number(JWT_COOKIE_EXPIRY) * 60 * 1000),
      httpOnly: true,
    };

    if (env === "production") {
      options.secure = true;
    }

    await this.updateUserLastLogin(user.id);

    res
      .status(statusCode)
      .cookie(USER_TOKEN, token, {
        domain: "localhost",
        ...options,
      })
      // .cookie(USER_TOKEN, token, {
      //   domain: "134.209.190.84",
      //   ...options,
      // })
      .json({
        success: true,
        user,
        token,
      });
  };

  verifyGoogleIdToken = async (token: string) => {
    try {
      const OAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await OAuthClient?.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
      });
      return { payload: ticket.getPayload() };
    } catch (error) {
      throw new ErrorResponse(
        "Invalid user detected. Please try again",
        HttpStatusCode.BadRequest
      );
    }
  };

  verifyGoogleAccessToken = async (token: string) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch user info");
      }
      const profile = await res.json();
      return { payload: profile };
    } catch (error) {
      // console.log({ error });
      throw new ErrorResponse(
        "Invalid user detected. Please try again",
        HttpStatusCode.BadRequest
      );
    }
  };

  /**
   * Description placeholder
   *
   * @async
   * @param {Request} req
   * @param {Response} _
   * @param {NextFunction} next
   * @returns {*}
   */
  isEmailValidAndAvailable = async (
    req: Request,
    _: Response,
    next: NextFunction
  ) => {
    const { email } = req.body;
    const result = await this.readFromDB(
      `MATCH (u:${NodeLabels.User} {email: $email}) RETURN u`,
      { email }
    );
    if (result.records.length) {
      throw new Error("Email already exists");
    }
    next();
  };

  /**
   * Description placeholder
   *
   * @async
   * @param {{
   *     email: string;
   *     password: string;
   *   }} param0
   * @param {string} param0.email
   * @param {string} param0.password
   * @returns {unknown}
   */
  createUser = async (params: {
    email: string;
    password: string;
  }) => {

    const record = await this.writeToDB(
      `
          MERGE (u:${NodeLabels.User} {email: $email})
          ON CREATE SET 
            u.password = $password,
            u.id = randomuuid(),
            u.isEmailVerified = false,
            u.username = $email
            u.createdAt = datetime()
            u.following = 0
            u.followers = 0
          RETURN u
        `,

        params
    );

    const user = record.records.map((record) => {
      const user = record.get("u").properties;
      return {
        id: user.id,
        email: user.email,
      };
    })[0];

    await this.sendEmailVerification(user);
    return user;
  };

  updateUserLastLogin = async (id: string) => {
    const result = await this.writeToDB(
      `
      MERGE (u:${NodeLabels.User} {id: $id})
      SET u.lastLogin = dateTime()
      RETURN u
      `,
      { id }
    );

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;

    return userService.withDTO(doc);
  };

  createGoogleUser = async (payload: Partial<IUser>) => {
    const updates = toDTO(payload, [
      "avatar",
      "firstName",
      "lastName",
      "email",
      "googleIdToken",
      "isEmailVerified",
    ]);

    const result = await this.writeToDB(
      `
        MERGE (u:${NodeLabels.User} {email: $email})
        ON CREATE SET 
          u.id = randomuuid(),
          u += $updates

        ON MATCH SET  
          u.id = CASE WHEN u.id IS NULL THEN $id ELSE u.id END,
          u += $updates

        RETURN u
      `,
      { email: payload?.email, updates }
    );

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;

    return userService.withDTO(doc) as IUser;
  };

  /**
   * Description placeholder
   *
   * @async
   * @param {{
   *     username: string;
   *     password: string;
   *   }} payload
   * @returns {Promise<UserResponseDto>}
   */
  loginUser = async (payload: {
    username: string;
    password: string;
  }): Promise<UserResponseDto> => {
    const user = await this.findUserByCredentials(payload);

    // if (!user.isActive) {
    //   throw new ErrorResponse(
    //     "User account blocked, contact support",
    //     HttpStatusCode.BadRequest
    //   );
    // }

    if (!user.isEmailVerified) {
      await this.sendEmailVerification(user);

      throw new ErrorResponse(
        "Account not verified. You have been sent a mail with instructions on how to verify your account",
        HttpStatusCode.BadRequest
      );
    }

    return user;
  };

  sendUserResetPasswordToken = async (username: string) => {
    const result = await this.readFromDB(
      `
       MATCH (u:${NodeLabels.User})
       WHERE u.username = $username OR u.email = $username OR u.phone = $username
       RETURN u
      `,
      { username }
    );

    if (!result.records.length) {
      return null;
    }

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;
    const { OTP, hashedOTP } = await otpService.generateOTP();

    await this.writeToDB(
      `
      MERGE (o:${NodeLabels.OTP} {email: $email, type: $type })
      SET 
        o.createdAt = datetime(), 
        o.expiresAt=datetime() + duration({ minutes: 5 }), 
        o.otp = $otp 
    `,
      {
        otp: hashedOTP,
        type: "reset-password",
        email: doc?.email,
      }
    );

    return await emailRepository.sendResetPasswordMail({
      user: {
        email: doc?.email,
        firstName: doc?.firstName || "",
      },
      OTP,
    });
  };

  verifyUserEmail = async (email: string, payload?: { otp: string }) => {
    // const updates = toDTO(payload, ["isEmailVerified"]);

    let isEmailVerified = false;

    if (payload) {
      if (!payload?.otp) {
        throw new ErrorResponse(
          "Invalid or Expired One Time Password",
          HttpStatusCode.BadRequest
        );
      }

      const OTP = await otpService.findOTP(email, "verification");

      if (!OTP || OTP?.email != email) {
        throw new ErrorResponse(
          "Invalid or Expired One Time Password",
          HttpStatusCode.BadRequest
        );
      }

      const isValidOTP = await bcrypt.compare(payload.otp, OTP.otp);

      if (!isValidOTP) {
        throw new ErrorResponse(
          "Invalid or Expired One Time Password",
          HttpStatusCode.BadRequest
        );
      }
    }

    isEmailVerified = true;

    const result = await this.writeToDB(
      `
      MERGE (u:${NodeLabels.User} {email: $email})
      SET u.isEmailVerified = $isEmailVerified
      RETURN u
      `,
      { email, isEmailVerified }
    );

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;

    return omitDTO(doc, ["password", "isDeleted"]) as IUser;
  };

  sendEmailVerification = async (user: IUser) => {
    if (user?.isEmailVerified) {
      throw new ErrorResponse(
        "Account already verified",
        HttpStatusCode.BadRequest
      );
    }

    const { OTP, hashedOTP } = await otpService.generateOTP();

    await this.writeToDB(
      `
      MERGE (o:${NodeLabels.OTP} {email: $email, type: $type })
      SET 
        o.createdAt = datetime(), 
        o.expiresAt=datetime() + duration({ minutes: 5 }), 
        o.otp = $otp 
    `,
      {
        otp: hashedOTP,
        type: "verification",
        email: user?.email,
      }
    );

    await emailRepository.sendVerificationEmail({
      user,
      OTP,
    });
  };

  resetPassword = async (payload: {
    username: string;
    otp: string;
    password: string;
  }) => {
    const user = await userService.getUserByQueryWithCredentials(
      payload?.username
    );

    if (!user) {
      throw new ErrorResponse("User not found", HttpStatusCode.BadRequest);
    }

    const OTP = await otpService.findOTP(user?.email, "reset-password");

    if (!OTP || OTP?.email != user?.email) {
      throw new ErrorResponse(
        "Invalid One Time Password",
        HttpStatusCode.BadRequest
      );
    }

    const isValidOTP = await bcrypt.compare(payload.otp, OTP.otp);

    if (!isValidOTP) {
      throw new ErrorResponse(
        "Invalid or Expired One Time Password",
        HttpStatusCode.BadRequest
      );
    }

    const isMatchPassword: boolean = await bcrypt.compare(
      payload.password,
      user.password as string
    );

    if (isMatchPassword) {
      throw new ErrorResponse(
        "Can not use the same password as your old password",
        HttpStatusCode.BadRequest
      );
    }

    const hashedPassword = await this.hashPassword(payload.password);

    const result = await this.writeToDB(
      `
      MATCH (u:${NodeLabels.User} {email: $email}), (o:${NodeLabels.OTP} {email: $email})
      SET u.password = $hashedPassword
      DETACH DELETE o
      RETURN u
      `,
      { email: user?.email, hashedPassword }
    );

    const updatedUser = result.records.map((v) => v.get("u").properties)[0];

    return updatedUser;
  };
}

/**
 * 
 *
 * @type {AuthService}
 */
export const authService = new AuthService();
