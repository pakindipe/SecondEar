/**
 * Optional LLM risk engine. Used only when ANTHROPIC_API_KEY or OPENAI_API_KEY is set.
 * Plain fetch (no SDKs) to keep the dependency list short.
 */
import type { Assessment, TacticHit, TacticId, TranscriptLine } from "../src/shared/types.ts";

const TACTIC_IDS: TacticId[] = [
  "authority",
  "urgency",
  "credential_request",
  "payment_redirect",
  "secrecy",
  "remote_access",
  "threat",
  "user_disclosing",
];

const SYSTEM = `You are Second Ear, a scam-call detector listening to a live UK phone call on behalf of the person who answered ("USER").
Assess whether the CALLER is attempting fraud. Look for social-engineering tactics, including paraphrased ones:
- authority: claims to be a bank, police, tax office, tech company, etc.
- urgency: time pressure, panic ("your money is being taken right now")
- credential_request: asks for a one-time code, PIN, password, card details, online banking login
- payment_redirect: move money to a "safe account", gift cards, crypto, cash courier
- secrecy: don't tell family/bank staff, don't hang up, stay on the line
- remote_access: install an app, AnyDesk/TeamViewer, screen sharing
- threat: arrest, warrants, fines, account closure
- user_disclosing: the USER is reading out a code, PIN or card number
Legitimate callers (real banks, GPs, deliveries) may mention fraud or PINs but do NOT ask for codes, PINs or transfers, and often say "we will never ask for...". Do not flag those.
risk is 0-100: 0-30 normal call, 30-69 suspicious, 70-100 likely scam.
evidence must be a short verbatim quote from the transcript.`;

const SCHEMA = {
  type: "object",
  properties: {
    risk: { type: "integer", minimum: 0, maximum: 100 },
    tactics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: TACTIC_IDS },
          evidence: { type: "string" },
          line: { type: "integer", description: "Line number from the transcript" },
        },
        required: ["id", "evidence", "line"],
      },
    },
    rationale: { type: "string", description: "One plain-English sentence for the user." },
  },
  required: ["risk", "tactics", "rationale"],
};

interface RawResult {
  risk: number;
  tactics: { id: TacticId; evidence: string; line: number }[];
  rationale: string;
}

export function llmProvider(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

function formatTranscript(lines: TranscriptLine[]): string {
  return lines.map((l) => `[${l.id}] ${l.speaker.toUpperCase()}: ${l.text}`).join("\n");
}

async function callAnthropic(transcript: string, signal: AbortSignal): Promise<RawResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 600,
      system: SYSTEM,
      tools: [{ name: "report_assessment", description: "Report the scam assessment.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "report_assessment" },
      messages: [{ role: "user", content: `Transcript so far:\n${transcript}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { type: string; input?: RawResult }[] };
  const block = data.content.find((c) => c.type === "tool_use");
  if (!block?.input) throw new Error("No tool_use block in Anthropic response");
  return block.input;
}

async function callOpenAI(transcript: string, signal: AbortSignal): Promise<RawResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM}\nRespond with JSON matching this schema: ${JSON.stringify(SCHEMA)}` },
        { role: "user", content: `Transcript so far:\n${transcript}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0].message.content) as RawResult;
}

export async function assessWithLLM(lines: TranscriptLine[], timeoutMs = 8000): Promise<Assessment> {
  const provider = llmProvider();
  if (!provider) throw new Error("No LLM API key configured");
  const signal = AbortSignal.timeout(timeoutMs);
  const transcript = formatTranscript(lines);
  const raw = provider === "anthropic" ? await callAnthropic(transcript, signal) : await callOpenAI(transcript, signal);

  const validIds = new Set(lines.map((l) => l.id));
  const tactics: TacticHit[] = (raw.tactics ?? [])
    .filter((t) => TACTIC_IDS.includes(t.id))
    .map((t) => ({
      id: t.id,
      evidence: String(t.evidence).slice(0, 200),
      lineId: validIds.has(t.line) ? t.line : lines[lines.length - 1]?.id ?? 0,
      source: "llm" as const,
    }));
  return {
    risk: Math.max(0, Math.min(100, Math.round(Number(raw.risk) || 0))),
    tactics,
    protective: [],
    rationale: String(raw.rationale ?? ""),
    source: "llm",
  };
}
