import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import githubRoutes from "./routes/github";

const app = express();
const PORT = process.env.PORT || 5000;
connectDB();

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

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Compass backend is running" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Compass backend listening on port ${PORT}`);
});
