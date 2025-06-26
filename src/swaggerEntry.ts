// swaggerEntry.ts
import express from 'express';
import setupRoutes from './routes/index';

const app = express();
setupRoutes(app); // This triggers app.use(...) calls

export default app;
