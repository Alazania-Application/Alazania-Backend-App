import { AxiosError, HttpStatusCode } from "axios";
import { ErrorResponse } from "../utils";
import { Request, Response, NextFunction, ErrorRequestHandler } from "express";

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
  _: Request,
  res: Response,
  next: NextFunction
): void => {
  let error: CustomError = { ...err };

  if (err instanceof ErrorResponse) {
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

    console.log({ error });

    // Logger.err(error.message || "Server Error", true);

    res.status(error.statusCode || HttpStatusCode.InternalServerError).json({
      success: false,
      message: error.message || "Server Error",
      data: error.data,
      errors: error.errors,
    });
  }
};
