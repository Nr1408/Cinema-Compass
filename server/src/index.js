import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { getPublicQuestions } from "./data/questions.js";
import { recommendFromAnswers } from "./services/recommender.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/questions", (_req, res) => {
  res.json({ questions: getPublicQuestions() });
});

app.post("/api/recommend", async (req, res, next) => {
  try {
    const { answers } = req.body || {};

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({
        error: "answers must be an object with question ids as keys"
      });
    }

    const recommendation = await recommendFromAnswers(answers);
    return res.json(recommendation);
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
