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
  transports: [
    // new transports.Console(),
    new BufferedTelegramTransport({
      token: TELEGRAM_BOT_TOKEN!,
      chatId: TELEGRAM_CHAT_ID!,
      level: "error",
      flushInterval: 10000, // 10s
      bufferLimit: 5,
    }),
  ],
});

