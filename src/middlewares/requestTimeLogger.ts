import { Request, Response, NextFunction } from "express";

// Custom middleware to log request processing time
export const logRequestProcessingTime = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  // Log the time when the request is received
  console.log(
    `${req.method} | Request received: ${
      req.url
    } - [${new Date().toISOString()}] `
  );

  // Call the next middleware in the chain
  next();

  // Log the time when the response is sent
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `Request processed in ${duration}ms | ${Math.ceil(
        duration / 1000
      ).toFixed(1)}s - [${new Date().toISOString()}] `
    );
  });
};
