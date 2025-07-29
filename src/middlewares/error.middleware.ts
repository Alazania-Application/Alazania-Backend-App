import { AxiosError, HttpStatusCode } from "axios";
import { ErrorResponse } from "../utils";
import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { Neo4jError } from "neo4j-driver";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "@/config/index.js";
import { createLogger, format, transports } from "winston";
const { combine, timestamp, printf, errors } = format;
import { BufferedTelegramTransport } from "@/utils/telegram-logger.utils";

const logFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
});

export const logger = createLogger({
  level: "error",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat
  ),
  transports: [new transports.Console()],
});

if (process.env.NODE_ENV === "production") {
  logger.add(
    new BufferedTelegramTransport({
      token: TELEGRAM_BOT_TOKEN!,
      chatId: TELEGRAM_CHAT_ID!,
      level: "error",
      flushInterval: 10000, // 10s
      bufferLimit: 5,
    })
  );
}

interface CustomError extends Error {
  errno?: number;
  code?: string | number;
  path?: string;
  syscall?: string;
  stack?: string;
  statusCode?: number;
  errors?: string[] | { [key: string]: string }[];
  data?: string | Record<string, any>;
  keyPattern?: any;
}

export const errorHandler: ErrorRequestHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {

  let error: CustomError = { ...err };

  let neo4jError: Neo4jError | undefined;

  let loggerPayload = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    statusCode: error.statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    body: Object.keys(req.body),
    query: req.query,
    userId: req.user?.id, // if available
    neo4jCode: neo4jError?.code,
  };

  if (err instanceof ErrorResponse) {
    if (error.statusCode && error.statusCode < 500) {
      logger.warn(JSON.stringify(loggerPayload, null, 2));
    } else {
      logger.error(JSON.stringify(loggerPayload, null, 2));
    }
    res.status(HttpStatusCode.BadRequest).json({
      success: false,
      message: err.message,
    });
  } else {
    if (err instanceof AxiosError) {
      const axiosError = error as AxiosError;

      if (axiosError.response === undefined) {
        error.message =
          "Network error. Please check your internet connection and try again.";
      }
      const { response } = axiosError;
      if (response?.data) {
        const { message } = response.data as { message: any };
        if (message) {
          error.message = message;
        }
      }
      if (response?.status === 401) {
        error.message = "Authentication failed. Please check your credentials.";
      } else if (response?.status === 404) {
        error.message = "Resource not found. Please try again later.";
      } else {
        error.message = "An unexpected error occurred. Please try again later.";
      }
    }
    error.message = err.message;
    // Log the error using a logging library

    // Mongoose bad ObjectId
    if (err.name === "CastError") {
      error = new ErrorResponse("Resource not found", 404);
    }

    // Mongoose duplicate key
    if (err.code === 11000 || err.errno === 11000) {
      const duplicateKeyError = /index: (.+?) dup key/.exec(err.message);

      let errorMessage = "Duplicate value already exists.";

      if (duplicateKeyError) {
        const duplicateKey = duplicateKeyError[1].replace(/_\d+$/, ""); // Remove index numbers

        // Custom error message for the unique referee email constraint
        if (duplicateKey.includes("unique_referee_email")) {
          errorMessage =
            "A referee with this email already exists for this reference.";
        } else if (duplicateKey.includes("unique_referral_email")) {
          errorMessage = "Referral already exists";
        } else if (duplicateKey.includes("unique_staff_email")) {
          errorMessage =
            "A staff with this email already exists for this company.";
        } else if (duplicateKey.includes("unique_staff_phone")) {
          errorMessage =
            "A staff with this phone number already exists for this company.";
        } else {
          // Generic message for other unique constraints
          errorMessage = `${duplicateKey.replace(/_/g, " ")} already exists`;
        }
      }

      error = new ErrorResponse(errorMessage, 400);
    }

    // Mongoose validation error
    if (err.name === "ValidationError") {
      const errors = err.errors;

      const errorMessages = Object.values(errors as Record<string, any>).map(
        (val: any) => ({
          field: val.path || "key",
          error: val.properties.message,
        })
      );

      error = {
        ...err,
        message: errorMessages[0]?.error || error.message,
        errors: errorMessages,
        statusCode: HttpStatusCode.BadRequest,
      };
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      error.message = `Unexpected file field`;
      error.data = {
        field: (error as any)?.field,
      };
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      error.message = `Unexpected file upload limit exceeded.`;
      error.data = {
        field: (error as any)?.field,
      };
    }

    if (err instanceof Neo4jError) {
      neo4jError = err;

      let message = "Internal Server Error";
      let statusCode = HttpStatusCode.InternalServerError;
      if (err?.gqlStatusDescription) {
        (loggerPayload as any).serverError = err?.gqlStatusDescription;
      }

      if (
        neo4jError.code ===
          "Neo.ClientError.Schema.ConstraintValidationFailed" ||
        neo4jError.code ===
          "Neo.ClientError.Statement.ConstraintValidationFailed"
      ) {
        statusCode = HttpStatusCode.Conflict; // 409 Conflict is appropriate for duplicates/constraint violations
        // Attempt to parse the message for more specific details
        if (
          neo4jError.message.includes("already exists with label") &&
          neo4jError.message.includes("and property")
        ) {
          // Example: "Node(123) already exists with label `User` and property `email` = 'test@example.com'"
          const match = neo4jError.message.match(/`(.+?)` = '(.+?)'/);
          if (match && match[1] && match[2]) {
            message = `A record with this ${match[1]} (${match[2]}) already exists.`;
          } else {
            message = "A record with this unique property already exists.";
          }
        } else if (
          neo4jError.message.includes("already exists with property")
        ) {
          // More generic constraint message
          message = "A record with a unique property already exists.";
        } else {
          message =
            "Duplicate: A unique record already exists or a required property is missing.";
        }
      }
      // else if (neo4jError.classification === "CLIENT_ERROR") {
      //   // General client errors, e.g., malformed queries
      //   statusCode = HttpStatusCode.BadRequest;
      //   message = neo4jError.message; // Use the original Neo4j error message for client errors
      // }
      else if (neo4jError.classification === "TRANSIENT_ERROR") {
        // Temporary issues, e.g., deadlock
        statusCode = HttpStatusCode.ServiceUnavailable; // 503 Service Unavailable
        message =
          "The database is temporarily unavailable. Please try again later.";
      } else {
        // Internal server errors from Neo4j
        statusCode = HttpStatusCode.InternalServerError;
        // message = "An internal server error occurred.";
      }

      error = new ErrorResponse(message, statusCode);
      loggerPayload.message = error.message;
    }

    console.error({ err });

    if (error.statusCode && error.statusCode < 500) {
      logger.warn(JSON.stringify(loggerPayload, null, 2));
    } else {
      logger.error(JSON.stringify(loggerPayload, null, 2));
    }

    res.status(error.statusCode || HttpStatusCode.InternalServerError).json({
      success: false,
      message: error.message || "Internal Server Error",
      data: error.data,
      errors: error.errors,
    });
  }
};
