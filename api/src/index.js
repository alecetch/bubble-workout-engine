import express from "express";
import { importEmitterRouter } from "./routes/importEmitter.js";

const app = express();

// ...
app.use("/api",importEmitterRouter);

// ...
export default app;