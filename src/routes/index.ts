import { asyncHandler } from "@/middlewares/async.middleware";
import { authRouter } from "./auth.routes";

const basePath = "/api/v1";

export default (app: { use: (...args: any[]) => void }): void => {
  app.use(`${basePath}/auth`, asyncHandler(authRouter));
};