import { replaceTscAliasPaths } from 'tsc-alias';
replaceTscAliasPaths({
  resolveFullPaths: true, // Resolve full paths for the replacements
});
import { createServer } from "http";
import colors from "colors";
import express, { Express } from "express";
import { env, port } from "./config";
import indexMiddlewares from "./middlewares/index.middlewares.js";
import BaseService from "./services/base.service";
import { hashtagService } from "./services";
import { seedService } from "./services/seed.service";

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
