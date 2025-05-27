import { AxiosError } from "axios";

export class ErrorResponse extends Error {
  statusCode: number;
  data?: string | Record<string, any>;
  constructor(
    message: string,
    statusCode: number,
    data?: string | Record<string, any>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const getError = (error: any): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error.isAxiosError) {
    const axiosError = error as AxiosError;
    if (axiosError.response === undefined) {
      return "Network error. Please check your internet connection and try again.";
    }
    const { response } = axiosError;
    if (response?.data) {
      const { message } = response.data as { message: any };
      if (message) {
        return message;
      }
    }
    if (response.status === 401) {
      return "Authentication failed. Please check your email and password.";
    } else if (response.status === 404) {
      return "Resource not found. Please try again later.";
    } else {
      return "An unexpected error occurred. Please try again later.";
    }
  } else {
    if (error.message) {
      return error.message;
    } else {
      return "An unexpected error occurred. Please try again later.";
    }
  }
};
