import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { connectDB } from "./config/db";
import authRoutes from "./routes/auth";
import githubRoutes from "./routes/github";
import ossRoutes from "./routes/oss";
import solverRoutes from "./routes/solver";
import issuesRoutes from "./routes/issues";

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/oss", ossRoutes);
app.use("/api/issues", issuesRoutes);
app.use("/api/solver", solverRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "Compass backend is running",
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(`Compass backend listening on port ${PORT}`);
});
