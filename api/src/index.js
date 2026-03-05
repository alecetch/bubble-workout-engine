import express from "express";
import { importEmitterRouter } from "./routes/importEmitter.js";
import { segmentLogRouter } from "./routes/segmentLog.js";

const app = express();

app.use(express.json());

// ...
app.use("/api",importEmitterRouter);
app.use("/api", segmentLogRouter);

// ...
export default app;
