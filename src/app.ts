import { createServer } from "http";
import colors from "colors";
import express, { Express } from "express";
import { env, port } from "./config";
import indexMiddlewares from "./middlewares/index.middlewares";
import Neo4jService from "./services/neo4j.service";

const app: Express = express();
indexMiddlewares(app);

// Create an HTTP server for the API
const server = createServer(app);

// Initialize database and start server
async function startServer() {
  try {
    const neo4jService = Neo4jService.getInstance();
    await neo4jService.initializeDatabase();
    server.listen(port, () =>
      console.log(
        colors.yellow.bold(`API server running in ${env} mode on port ${port}`)
      )
    );
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
  const neo4jService = Neo4jService.getInstance();
  await neo4jService.close();
  process.exit(0);
});

export default app;
