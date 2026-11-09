/**
 * Pure decision logic: merging engines, deciding when to whisper, parsing voice commands, building the summary.
 * No browser APIs here, so it's easy to unit test and reason about.
 */
import type { Assessment, TacticHit, TacticId, TranscriptLine } from "../shared/types.ts";
import { TACTIC_LABELS } from "../shared/types.ts";

export const RISK_SUSPICIOUS = 40;
export const RISK_DANGER = 70;

export function riskLevel(risk: number): "safe" | "suspicious" | "danger" {
  return risk >= RISK_DANGER ? "danger" : risk >= RISK_SUSPICIOUS ? "suspicious" : "safe";
}

/**
 * Combine rules + LLM. Risk takes the max: rules give instant, explainable hits;
 * the LLM catches paraphrased scams the regexes miss. A miss costs more than a false whisper.
 */
export function mergeAssessments(rules: Assessment, llm: Assessment | null): Assessment {
  if (!llm) return rules;
  const byId = new Map<TacticId, TacticHit>();
  for (const t of [...rules.tactics, ...llm.tactics]) if (!byId.has(t.id)) byId.set(t.id, t);
  return {
    risk: Math.max(rules.risk, llm.risk),
    tactics: [...byId.values()],
    protective: rules.protective,
    rationale: llm.risk >= rules.risk && llm.rationale ? llm.rationale : rules.rationale,
    source: llm.risk > rules.risk ? "llm" : "rules",
  };
}

/** What to whisper about each tactic: short, calm and actionable. Ordered by priority. */
const WHISPER_LINES: [TacticId, string][] = [
  ["user_disclosing", "Stop. Don't read out that code. Anyone with it can get into your account."],
  ["credential_request", "Careful. They're asking for a code. Your real bank will never ask for that over the phone."],
  ["payment_redirect", "Warning. Real banks and officials never ask you to move money to a safe account, or pay with gift cards."],
  ["remote_access", "Don't install anything. Real companies don't ask you to download an app during a call."],
  ["threat", "Real officials don't threaten arrest over the phone. You can hang up."],
  ["secrecy", "They're telling you not to talk to anyone. That's a scam sign. You're allowed to hang up and check."],
  ["urgency", "They're rushing you. Take your time. A real organisation will wait."],
];

export interface Whisper {
  id: number;
  t: number;
  text: string;
  level: "info" | "suspicious" | "danger";
  kind: "warning" | "answer" | "ack";
}

export interface WhisperState {
  warned: Set<TacticId>;
  offeredHangup: boolean;
}

/**
 * Decide whether to whisper now. Rules of thumb:
 *  - At most one whisper per turn, about the highest-priority *new* tactic. Talking over the call too often is its own harm.
 *  - Nothing is whispered while overall risk is "safe". So reading out your phone number to a friend is fine,
 *    but reading out digits after a caller asked for a code is caught (risk is already high by then).
 *  - The first time risk crosses DANGER, offer to hang up.
 */
export function decideWhisper(a: Assessment, state: WhisperState): { text: string; level: Whisper["level"] } | null {
  const present = new Set(a.tactics.map((t) => t.id));
  const level = riskLevel(a.risk);
  if (level === "safe") return null;

  const next = WHISPER_LINES.find(([id]) => present.has(id) && !state.warned.has(id));
  const offerHangup = level === "danger" && !state.offeredHangup;
  if (!next && !offerHangup) return null;

  const parts: string[] = [];
  if (next) {
    parts.push(next[1]);
    // Mark everything present as warned, so we don't drip-feed a whisper per tactic on later turns.
    for (const [id] of WHISPER_LINES) if (present.has(id)) state.warned.add(id);
  }
  if (offerHangup) {
    parts.push("Say 'Second Ear, hang up' and I'll end the call.");
    state.offeredHangup = true;
  }
  return { text: parts.join(" "), level };
}

export type Command =
  | { kind: "hangup" }
  | { kind: "is_real" }
  | { kind: "notify_family"; who: string }
  | { kind: "unknown"; text: string };

/** Wake phrase + intent. Recognisers often hear "second ear" as "second year", "2nd ear", etc. */
const WAKE = /\b(second|2nd|secon)\s*(ear|year|here|eer)\b[,.!]?\s*/i;

export function parseCommand(utterance: string): Command | null {
  const m = utterance.match(WAKE);
  if (!m) return null;
  const rest = utterance.slice(m.index! + m[0].length).toLowerCase();
  if (/\b(hang up|end (the|this) call|cut (it|them) off|get rid of them)\b/.test(rest)) return { kind: "hangup" };
  if (/\b(is this|is it|are they) (real|a scam|legit|genuine|safe)|what do you think|should i trust\b/.test(rest)) return { kind: "is_real" };
  const fam = rest.match(/\b(tell|message|text|call|alert) my (daughter|son|husband|wife|partner|carer|family)\b/);
  if (fam) return { kind: "notify_family", who: fam[2] };
  return { kind: "unknown", text: rest };
}

export function answerIsReal(a: Assessment): string {
  const level = riskLevel(a.risk);
  if (level === "danger") return `This looks like a scam. ${a.rationale} Say 'hang up' and I'll end the call.`;
  if (level === "suspicious") return `I'm not sure. ${a.rationale} If in doubt, hang up and call them back on a number you trust.`;
  return "Nothing suspicious so far. If they ask for codes, PINs or money, I'll tell you.";
}

export interface CallSummary {
  verdict: "scam" | "suspicious" | "normal";
  peakRisk: number;
  durationMs: number;
  tactics: { id: TacticId; label: string; evidence: string; t: number }[];
  whispers: number;
  endedBy: "second_ear" | "user" | "caller";
  disclosed: boolean;
  actions: string[];
  familyMessage: string | null;
}

export function buildSummary(args: {
  transcript: TranscriptLine[];
  final: Assessment;
  peakRisk: number;
  whispers: Whisper[];
  endedBy: CallSummary["endedBy"];
  durationMs: number;
  callerId: string;
  notify: string | null;
}): CallSummary {
  const { transcript, final, peakRisk, whispers, endedBy, durationMs, callerId, notify } = args;
  const tByLine = new Map(transcript.map((l) => [l.id, l.t]));
  const level = riskLevel(peakRisk);
  const verdict = level === "danger" ? "scam" : level === "suspicious" ? "suspicious" : "normal";
  const disclosed = final.tactics.some((t) => t.id === "user_disclosing");

  const actions: string[] = [];
  if (disclosed) actions.push("You read out a code. Call your bank now on the number on the back of your card and tell them.");
  if (verdict === "scam") actions.push(`Block ${callerId === "Unknown" ? "this number" : `the number claiming to be ${callerId}`}.`);
  if (verdict !== "normal") actions.push("Report it to Action Fraud (0300 123 2040) or forward the number to 7726.");
  if (verdict === "normal") actions.push("Nothing to do.");

  // Written for a relative or carer, so it describes the call in the third person rather than reusing the whisper wording.
  const heard = final.tactics.filter((t) => t.id !== "user_disclosing").map((t) => TACTIC_LABELS[t.id].replace(/^\w/, (c) => c.toLowerCase()));
  const familyMessage =
    verdict === "normal" && !notify
      ? null
      : `Second Ear: a ${{ scam: "likely scam ", suspicious: "suspicious ", normal: "" }[verdict]}call from "${callerId}" just ended (${fmtTime(durationMs)}). ` +
        (heard.length ? `Warning signs: ${heard.join(", ")}. ` : "") +
        (endedBy === "second_ear" ? "Second Ear ended the call. " : "") +
        (disclosed ? "A code may have been read out, so please help them call their bank on the number on their card." : "Worth a quick check-in.");

  return {
    verdict,
    peakRisk,
    durationMs,
    tactics: final.tactics.map((t) => ({ id: t.id, label: TACTIC_LABELS[t.id], evidence: t.evidence, t: tByLine.get(t.lineId) ?? 0 })),
    whispers: whispers.filter((w) => w.kind === "warning").length,
    endedBy,
    disclosed,
    actions,
    familyMessage,
  };
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
