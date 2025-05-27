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
export const JWT_COOKIE_EXPIRY = process.env.JWT_COOKIE_EXPIRY as StringValue;;
export const VERIFICATION_TOKEN_EXPIRY =
         process.env.VERIFICATION_TOKEN_EXPIRY as StringValue;
