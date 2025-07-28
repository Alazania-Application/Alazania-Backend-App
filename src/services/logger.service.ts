import { env } from "@/config/index.js";
import { createLogger, format, transports } from "winston";
const { combine, timestamp, printf, errors } = format;
import { TGTransport } from "@/utils/telegram-logger.utils";

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
  transports: [
    ...(env == "production" ? [new transports.Console(), TGTransport] : []),
  ],
});
