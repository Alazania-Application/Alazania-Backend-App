import { NextFunction, Request, Response } from "express";
import { HttpStatusCode } from "axios";
import { asyncHandler } from "./async.middleware";
import { ErrorResponse } from "../utils";
import { IUser } from "@/models";
import { authService, userService } from "@/services";

/**
 * Description placeholder
 *
 * @class AuthenticatorMiddleware
 * @typedef {AuthenticatorMiddleware}
 */
class AuthenticatorMiddleware {
  /**
   * Description placeholder
   *
   * @returns {never}
   */
  private AuthenticateError = () => {
    throw new ErrorResponse("Not authenticated", HttpStatusCode.Unauthorized);
  };

  private AuthorizeError = () => {
    throw new ErrorResponse("Not authorized", HttpStatusCode.Forbidden);
  };

  /**
   * Finds and verifies the jwt token
   * @param req
   * @param res
   * @param next
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  jwt = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      let token;

      // Check for token in Authorization header if not found in cookies
      if (
        !token &&
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
      ) {
        token = req.headers.authorization.split(" ")[1];
      }

      // Make sure token exists
      if (!token) {
        throw this.AuthenticateError();
      }

      try {
        const decode = authService.verifyJwtToken(token);

        // @ts-ignore
        req.id = decode.id;
        next();
      } catch (err) {
        throw this.AuthenticateError();
      }
    }
  );

  /**
   * Finds and verifies the jwt token
   * @param req
   * @param res
   * @param next
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  protectRoute = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      let token;

      // Check for token in Authorization header if not found in cookies
      if (
        !token &&
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
      ) {
        token = req.headers.authorization.split(" ")[1];
      }

      // Make sure token exists
      if (!token) {
        throw this.AuthenticateError();
      }

      try {
        const decode = authService.verifyJwtToken(token);

        // @ts-ignore
        req.id = decode.id;
        let user: IUser;

        user = await userService.getUserById(req.id);

        if (!user) {
          throw this.AuthenticateError();
        }

        req.user = user;

        next();
      } catch (err) {
        throw this.AuthenticateError();
      }
    }
  );

  isAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      if (!("user" in req) || !(req as any).isAdmin) {
        throw this.AuthorizeError();
      }

      next();
    }
  );

  // permittedRoles = (roles: (BaseRoles | StaffRoles)[]) =>
  //   asyncHandler(async (req: Request, res, next) => {
  //     if (
  //       (req.user?.role as BaseRoles) === "super-admin" ||
  //       req?.isSuperAdmin
  //     ) {
  //       next();
  //     } else if (
  //       !roles.includes((req.user?.role as BaseRoles | StaffRoles) || "")
  //     ) {
  //       throw this.AuthorizeError();
  //     }
  //     next();
  //   });

  // unpermittedRoles = (roles: (BaseRoles | StaffRoles)[]) =>
  //   asyncHandler(async (req: Request, res, next) => {
  //     if (
  //       (req.user?.role as BaseRoles) === "super-admin" ||
  //       req?.isSuperAdmin
  //     ) {
  //       next();
  //     } else if (
  //       roles.includes((req.user?.role as BaseRoles | StaffRoles) || "")
  //     ) {
  //       throw this.AuthorizeError();
  //     }
  //     next();
  //   });

  // /**
  //  * isSuperAdmin checks if the request is made by an Superadmin
  //  * This middleware must be called directly after the hydrateUser middleware
  //  */
  // isSuperAdmin = asyncHandler(
  //   async (req: Request, res: Response, next: NextFunction) => {
  //     if (!("user" in req) || !req?.isSuperAdmin) {
  //       throw this.AuthorizeError();
  //     }

  //     next();
  //   },
  // );
}

export const authMiddleWare = new AuthenticatorMiddleware();
