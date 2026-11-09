import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessWithLLM, llmProvider } from "./llm.ts";
import type { TranscriptLine } from "../src/shared/types.ts";

const app = express();
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, llm: llmProvider() });
});

app.post("/api/analyze", async (req, res) => {
  const lines = req.body?.transcript as TranscriptLine[] | undefined;
  if (!Array.isArray(lines)) {
    res.status(400).json({ error: "transcript must be an array" });
    return;
  }
  if (!llmProvider()) {
    res.status(503).json({ error: "No LLM key configured; client should use rules only." });
    return;
  }
  const started = Date.now();
  try {
    const assessment = await assessWithLLM(lines.slice(-30));
    res.json({ assessment, latencyMs: Date.now() - started });
  } catch (err) {
    console.error("[analyze]", (err as Error).message);
    res.status(502).json({ error: (err as Error).message });
  }
});

// --production flag (not NODE_ENV=...) so `npm start` also works in Windows shells.
if (process.env.NODE_ENV === "production" || process.argv.includes("--production")) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  const llm = llmProvider();
  console.log(`Second Ear API on http://localhost:${port} (risk engine: rules${llm ? ` + ${llm}` : " only"})`);
});
