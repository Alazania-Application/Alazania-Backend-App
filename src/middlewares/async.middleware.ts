import { NextFunction, Request, RequestHandler, Response } from "express";

export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    return Promise.resolve(fn(req, res, next)).then(() => undefined).catch(next);
  };
};
