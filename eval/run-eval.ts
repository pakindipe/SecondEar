/**
 * Measures how well each risk engine separates scam calls from genuine ones.
 *   npm run eval            # rules only (no key needed)
 *   npm run eval            # with ANTHROPIC_API_KEY / OPENAI_API_KEY in .env: rules + LLM
 */
import "dotenv/config";
import { FIXTURES } from "./fixtures.ts";
import { assessWithRules } from "../src/shared/rules.ts";
import { RISK_DANGER, RISK_SUSPICIOUS } from "../src/lib/assist.ts";
import { assessWithLLM, llmProvider } from "../server/llm.ts";
import type { TranscriptLine } from "../src/shared/types.ts";

type Engine = "rules" | "llm" | "combined";

function toTranscript(lines: [("caller" | "user"), string][]): TranscriptLine[] {
  return lines.map(([speaker, text], i) => ({ id: i + 1, speaker, text, t: i * 5000 }));
}

async function main() {
  const provider = llmProvider();
  const engines: Engine[] = provider ? ["rules", "llm", "combined"] : ["rules"];
  const results: Record<Engine, { id: string; isScam: boolean; risk: number }[]> = { rules: [], llm: [], combined: [] };

  console.log(`\nSecond Ear eval: ${FIXTURES.length} calls (${FIXTURES.filter((f) => f.isScam).length} scam, ${FIXTURES.filter((f) => !f.isScam).length} genuine)`);
  console.log(`Engines: ${engines.join(", ")}${provider ? ` (LLM = ${provider})` : " (set an API key in .env to add the LLM)"}\n`);

  const header = ["call", "label", "rules", ...(provider ? ["llm", "combined"] : []), "tactics (rules)"];
  const rows: string[][] = [];

  for (const f of FIXTURES) {
    const t = toTranscript(f.lines);
    const r = assessWithRules(t);
    results.rules.push({ id: f.id, isScam: f.isScam, risk: r.risk });
    const row = [f.id, f.isScam ? "SCAM" : "ok", String(r.risk)];
    if (provider) {
      try {
        const l = await assessWithLLM(t, 20000);
        results.llm.push({ id: f.id, isScam: f.isScam, risk: l.risk });
        results.combined.push({ id: f.id, isScam: f.isScam, risk: Math.max(l.risk, r.risk) });
        row.push(String(l.risk), String(Math.max(l.risk, r.risk)));
      } catch (err) {
        console.error(`  LLM failed on ${f.id}: ${(err as Error).message}`);
        row.push("err", String(r.risk));
        results.combined.push({ id: f.id, isScam: f.isScam, risk: r.risk });
      }
    }
    row.push([...new Set(r.tactics.map((x) => x.id))].join(", ") || "-");
    rows.push(row);
  }

  printTable(header, rows);

  console.log("\nAt each threshold: scams caught (recall) and genuine calls wrongly flagged (false positives)\n");
  const sumRows: string[][] = [];
  for (const e of engines) {
    for (const [name, th] of [
      [`whisper (≥${RISK_SUSPICIOUS})`, RISK_SUSPICIOUS],
      [`hang-up offer (≥${RISK_DANGER})`, RISK_DANGER],
    ] as const) {
      const res = results[e];
      const scams = res.filter((x) => x.isScam);
      const legit = res.filter((x) => !x.isScam);
      const tp = scams.filter((x) => x.risk >= th).length;
      const fp = legit.filter((x) => x.risk >= th).length;
      const missed = scams.filter((x) => x.risk < th).map((x) => x.id);
      sumRows.push([e, name, `${tp}/${scams.length}`, `${fp}/${legit.length}`, missed.join(", ") || "-"]);
    }
  }
  printTable(["engine", "threshold", "scams caught", "false alarms", "missed"], sumRows);
  console.log();
}

function printTable(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (r: string[]) => r.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) => console.log(fmt(r)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
