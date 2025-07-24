import "module-alias/register.js"
import { createServer } from "http";
import colors from "colors";
import express, { Express } from "express";
import { env, port } from "./config/index.js";
import indexMiddlewares from "./middlewares/index.middlewares.js";
import BaseService from "./services/base.service.js";
import { hashtagService } from "./services/hashtags.service.js";
import { seedService } from "./services";

const app: Express = express();
indexMiddlewares(app);

// Create an HTTP server for the API
const server = createServer(app);

// Initialize database and start server
async function startServer() {
  try {
    await seedService.initializeDatabase().then(async () => {
      await hashtagService.seedHashtagsAndTopics();
    });
    server.listen(port, () => {
      console.log(
        colors.yellow.bold(`🚀 API server running in ${env} mode on port ${port}`)
      );
      console.log(
        colors.green.bold(`📚 API Documentation: http://localhost:${port}/api/v1/docs`)
      );
    });
  } catch (error) {
    console.error("Server startup error:", error);
  }
}

startServer();

// Handle unhandled promise rejections
process.on("unhandledRejection", (err: Error, promise) => {
  console.log(colors.red(`Error: ${err.message}`));
});

// Cleanup on exit
process.on("SIGINT", async () => {
  const baseService = BaseService.getInstance();
  await baseService.close();
  process.exit(0);
});

export default app;
