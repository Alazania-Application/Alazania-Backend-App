import winston from "winston";
import { SeqTransport } from "@datalust/winston-seq";
import { LOGGER_API_KEY, LOGGER_URL } from "@/config";
import { hostname } from "os";

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "warn" : "debug",

  format: winston.format.combine(
    /* This is required to get errors to log with stack traces. See https://github.com/winstonjs/winston/issues/1498 */
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  defaultMeta: {
    application: "alazania",
    environment: process.env.NODE_ENV,
    instanceId: process.env.INSTANCE_ID || hostname(),
  },
  
  transports: [
    // new winston.transports.Console({
    //   format: winston.format.simple(),
    // }),

    new SeqTransport({
      serverUrl: LOGGER_URL,
      apiKey: LOGGER_API_KEY,
      onError: (e) => {
        console.error(e);
      },
    }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}
