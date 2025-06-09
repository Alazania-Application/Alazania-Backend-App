import { asyncHandler } from "../middlewares/async.middleware";
import { authRouter } from "./auth.routes";
import { userRouter } from "./user.routes";
import { topicRouter } from "./interest.routes";

const basePath = "/api/v1";

export default (app: { use: (...args: any[]) => void }): void => {
  app.use(`${basePath}/auth`, asyncHandler(authRouter));
  app.use(`${basePath}/user`, asyncHandler(userRouter));
  app.use(`${basePath}/interest`, asyncHandler(topicRouter));
};