import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Neo4jService from "./neo4j.service";
import { v4 as uuidv4 } from "uuid";
import { CookieOptions, NextFunction, Request, Response } from "express";
import { IUser } from "@/types/user";
import { ErrorResponse, getFormattedUrl, verifyJwtToken } from "@/utils";
import { HttpStatusCode } from "axios";
import {
  env,
  FRONTEND_URL,
  JWT_COOKIE_EXPIRY,
  JWT_EXPIRY,
  JWT_KEY,
  USER_TOKEN,
} from "@/config";
import { emailRepository } from "@/repository/email.repository";

type AuthPayload = { id?: string; email?: string };

class AuthService extends Neo4jService {
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
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, bcrypt.genSaltSync(10));
  }

  // Find staff credentials
  private async findUserByCredentials(
    {
      username,
      password,
    }: {
      username: string;
      password: string;
    } // : Promise<User | undefined>
  ) {
    const result = await this.readFromDB(
      `
        MATCH (u:User)
        WHERE u.username = $username OR u.email = $username OR u.phone = $username
        RETURN u
        `,
      { username }
    );

    if (!result.records.length) {
      throw new ErrorResponse("Invalid credentials", HttpStatusCode.BadRequest);
    }

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;

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

    const { password: hashedPassword, ...user } = doc;
    if (user.createdAt && typeof user.createdAt.toString === "function") {
      user.createdAt = user.createdAt.toString();
    }
    return user;
  }

  /**
   * Generates a signed JWT token for the user
   * @returns {Promise<string>}
   */
  private async getSignedJWT(user: IUser) {
    return jwt.sign({ id: user.id, email: user.email }, JWT_KEY, {
      expiresIn: JWT_EXPIRY,
    });
  }

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

  isEmailValidAndAvailable = async (
    req: Request,
    _: Response,
    next: NextFunction
  ) => {
    const session = this.getSession();
    try {
      const { email } = req.body;
      const result = await session.run(
        "MATCH (u:User {email: $email}) RETURN u",
        { email }
      );
      if (result.records.length) {
        throw new Error("Email already exists");
      }
      next();
    } finally {
      await session.close();
    }
  };

  createUser = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const session = this.getSession();
    try {
      const payload = {
        email,
        password: await this.hashPassword(password),
        id: uuidv4(),
      };

      const record = await session.run(
        `
          MERGE (u:User {email: $email})
          ON CREATE SET 
            u.password = $password,
            u.id = $id
            u.createdAt = datetime(),
          RETURN u
        `,
        payload
      );

      return record.records.map((record) => {
        const user = record.get("u").properties;
        return {
          id: user.id,
          email: user.email,
        };
      })[0];
    } catch (error) {
      throw error;
    } finally {
      await session.close();
    }
  };

  loginUser = async (payload: {
    username: string;
    password: string;
  }): Promise<IUser> => {
    const user = await this.findUserByCredentials(payload);

    // if (!user.isActive) {
    //   throw new ErrorResponse(
    //     "User account blocked, contact support",
    //     HttpStatusCode.BadRequest
    //   );
    // }

    // if (!user.emailVerified) {
    //   const emailToken = (user as UserType).getVerificationToken();

    //   const queryParams = new URLSearchParams();

    //   if (emailToken) {
    //     queryParams.set("token", emailToken);
    //   }

    //   const link = `${FRONTEND_URL}/recruiter/auth/verify-user?${queryParams?.toString()}`;
    //   await EmailRepository.sendEmailConfirmation({
    //     email: payload.email,
    //     data: {
    //       link,
    //     },
    //   });
    //   throw new UserEmailNotVerified();
    // }

    return user;
  };

  sendUserResetPasswordToken = async (username: string) => {
    const result = await this.readFromDB(
      `
       MATCH (u:User)
       WHERE u.username = $username OR u.email = $username OR u.phone = $username
       RETURN u
      `,
      { username }
    );

    if (!result.records.length) {
      return null;
    }

    const doc = result.records.map((v) => v.get("u").properties)[0] as IUser;

    const resetToken = crypto.randomBytes(20).toString("hex");

    await this.writeToDB(
      `
      MERGE (u:User {id: $id})
      SET u.resetPasswordToken = $resetPasswordToken , u.resetPasswordTokenExpiryTime = $resetPasswordTokenExpiryTime
      `,
      {
        resetPasswordToken: crypto
          .createHash("sha256")
          .update(resetToken)
          .digest("hex"),
        resetPasswordTokenExpiryTime: Date.now() + 10 * 60 * 1000,
        id: doc?.id,
      }
    );

    const resetUrl = `${getFormattedUrl(
      FRONTEND_URL
    )}/reset-password/${resetToken}`;

    return await emailRepository.sendResetPasswordMail({
      user: {
        email: doc?.email,
      },
      resetUrl,
    });
  };
}

export const authService = new AuthService();
