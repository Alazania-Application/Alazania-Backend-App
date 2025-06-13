import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import express, { Application } from "express";
import { env } from "../config";
import { logRequestProcessingTime } from "./requestTimeLogger";
import { errorHandler } from "./error.middleware";
import indexRoutes from "../routes";
import { HttpStatusCode } from "axios";
import ValidatorMiddleware from "./validator.middleware";

export default (app: Application) => {
  app.use(
    cors({
      origin: ["http://localhost:8081", "http://127.0.0.1:8081"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    })
  );

  app.use(express.json());

  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Show routes called in console during development
  if (env === "development") {
    // Dev logging middleware
    app.use(morgan("dev"));
    app.use(logRequestProcessingTime);
  }

  // Security
  if (env === "production") {
    app.use(helmet());
  }
  
  app.use(ValidatorMiddleware.inputs(ValidatorMiddleware.paginationFilters()));

  //Use app routes
  indexRoutes(app);

  app.get("/api/v1", (_, res) => {
    res.status(HttpStatusCode.Ok).send({
      message: "Hello world!",
    });
  });

  //not found
  app.use("**", (_, res) => {
    res.status(HttpStatusCode.BadRequest).send({
      message: "Route not found",
    });
  });

  // Print and handle API errors
  app.use(errorHandler);
};
