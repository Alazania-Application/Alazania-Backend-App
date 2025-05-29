import * as Express from "express";

export {};

declare global {
  namespace Express {
    interface Request extends Express.Request {
      /* Custom request parameter */
      user: IUser,
      id: string,
      isAdmin: boolean,
    }
    interface Response extends Express.Response {
      /* Custom request parameter */
    }
  }
}
