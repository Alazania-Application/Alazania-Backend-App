import * as dotenv from "dotenv";
dotenv.config({ path: "./src/config/.env" });
import type { StringValue } from "ms";

export const env = process.env.NODE_ENV;
export const port = process.env.PORT;
export const db_uri = (process.env.DB_URI as string) || "bolt://localhost:7687";
export const db_username = (process.env.DB_USERNAME as string) || "";
export const db_password = (process.env.DB_PASSWORD as string) || "";
export const USER_TOKEN = (process.env.USER_TOKEN as string) || "";
export const JWT_KEY = process.env.JWT_KEY as StringValue;
export const JWT_EXPIRY = process.env.JWT_EXPIRY as StringValue;
export const JWT_COOKIE_EXPIRY = process.env.JWT_COOKIE_EXPIRY as StringValue;
export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET as StringValue;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET as StringValue;
export const VERIFICATION_TOKEN_EXPIRY = process.env
  .VERIFICATION_TOKEN_EXPIRY as StringValue;

export const MAIL_USERNAME = process.env.MAIL_USERNAME as string;
export const MAIL_PASSWORD = process.env.MAIL_PASSWORD as string;

export const FUSION_MAIL_TOKEN = process.env.FUSION_MAIL_TOKEN as string;


export const MJ_APIKEY_PUBLIC = process.env.MJ_APIKEY_PUBLIC as string;
export const MJ_APIKEY_PRIVATE = process.env.MJ_APIKEY_PRIVATE as string;

export const FRONTEND_URL = process.env.FRONTEND_URL as string;


// SPACES
export const SPACES_ENDPOINT = process.env.SPACES_ENDPOINT || "";
export const SPACES_ACCESS_KEY_ID = process.env.SPACES_ACCESS_KEY_ID || "";
export const SPACES_ACCESS_KEY = process.env.SPACES_ACCESS_KEY || "";
export const SPACES_BUCKET = process.env.SPACES_BUCKET || "";
export const SPACES_REGION = process.env.SPACES_REGION || "";

// Google auth
export const GOOGLE_CLIENT_ID= process.env.GOOGLE_CLIENT_ID
export const GOOGLE_CLIENT_SECRET= process.env.GOOGLE_CLIENT_SECRET
export const GOOGLE_WEB_CLIENT_REDIRECT= process.env.GOOGLE_WEB_CLIENT_REDIRECT

// LOGGER
export const LOGGER_API_KEY= process.env.LOGGER_API_KEY

// CONSTANTS
export const MAX_FILE_SIZE_MB = 5; //5MB
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024; //5MB
export const MAX_FILE_COUNT = 5;
export const MAX_FILE_SIZE_ERROR = `File size should not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`;

