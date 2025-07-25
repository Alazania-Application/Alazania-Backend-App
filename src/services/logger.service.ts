// // import pino from "pino";
// // import pinoToSeq from "pino-seq";
// // import pinoHttp from 'pino-http';
// import { LOGGER_API_KEY, LOGGER_URL } from "@/config";

// // const seqStream = pinoToSeq.createStream({
// //   serverUrl: LOGGER_URL, // or 'http://seq:5341' in Docker
// //   apiKey: LOGGER_API_KEY,
// //   onError: (err) => {
// //     console.error("Failed to send logs to Seq:", err);
// //   },
// // });

// export const logger = pino(
//   {
//     level: process.env.NODE_ENV === "production" ? "warn" : "debug",
//     timestamp: pino.stdTimeFunctions.isoTime,
//     base: { app: 'alazania' }
//   },
// //   seqStream
// );

// // export const httpLogger = pinoHttp({ logger });

// // export const logger = pino({
// //   level: process.env.NODE_ENV === "production" ? "warn" : "debug",
// //   transport: {
// //     target: "pino-seq",
// //     options: {
// //       serverUrl: LOGGER_URL,
// //       apiKey: LOGGER_API_KEY,
// //     },
// //   },
// // });

// // // // const logger = (await import('@datalust/winston-seq'))();

// // // export const logger = winston.createLogger({
// // //   level: process.env.NODE_ENV === "production" ? "warn" : "debug",

// // //   format: winston.format.combine(
// // //     /* This is required to get errors to log with stack traces. See https://github.com/winstonjs/winston/issues/1498 */
// // //     winston.format.errors({ stack: true }),
// // //     winston.format.json()
// // //   ),

// // //   defaultMeta: {
// // //     application: "alazania",
// // //     environment: process.env.NODE_ENV,
// // //     instanceId: process.env.INSTANCE_ID || hostname(),
// // //   },

// // //   transports: [
// // //     new winston.transports.Console({
// // //       format: winston.format.simple(),
// // //     }),

// // //     // new SeqTransport({
// // //     //   serverUrl: LOGGER_URL,
// // //     //   apiKey: LOGGER_API_KEY,
// // //     //   onError: (e) => {
// // //     //     console.error(e);
// // //     //   },
// // //     // }),
// // //   ],
// // // });

// // // //
// // // // If we're not in production then log to the `console` with the format:
// // // // `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
// // // //
// // // if (process.env.NODE_ENV !== "production") {
// // //   logger.add(
// // //     new winston.transports.Console({
// // //       format: winston.format.simple(),
// // //     })
// // //   );
// // // }
