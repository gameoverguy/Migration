import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// Allowed web frontends
const allowedOrigins = [
  "https://www.example.com",
  "https://example.com",
  "www.example.com",
];

if (process.env.NODE_ENV === "prod") {
  // Strict CORS for production
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );
} else {
  // Open CORS for local/test/dev environments
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  console.log("⚠️  CORS: Development mode — all origins allowed");
}

// Middlewares
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

import migrationRoutes from "./routes/migrationRoutes.js";

app.use("/migration", migrationRoutes);

// Example Home
app.get("/", (req, res) => {
  res.send("Migration API is running");
});

export default app;
