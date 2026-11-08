/**
 * Rule-based scam-tactic detector.
 *
 * Why rules as well as an LLM?
 *  - Works offline, with zero API keys, so the prototype always runs.
 *  - Instant (<1ms), so the whisper can fire the moment the caller finishes the line.
 *  - Explainable: every hit carries the exact phrase that triggered it.
 * The LLM engine (server/llm.ts) runs alongside it to catch paraphrased scams the rules miss.
 */
import type { Assessment, TacticHit, TacticId, TranscriptLine } from "./types.ts";

type PatternSet = Partial<Record<TacticId, RegExp[]>>;

const CALLER_PATTERNS: PatternSet = {
  authority: [
    /\b(this is|calling from|i'm from|i am from|on behalf of|speaking from)\b[^.?!]{0,30}\b(bank|fraud (team|department|unit)|security (team|department)|hmrc|tax (office|authority)|revenue|police|constabulary|microsoft|amazon|apple|government|ofcom|national crime agency)\b/i,
    /\b(fraud investigator|police officer|detective|security officer|tax officer)\b/i,
  ],
  urgency: [
    /\b(right now|immediately|urgent(ly)?|as soon as possible|straight away|act (now|fast|quickly)|before it'?s too late|time is running out)\b/i,
    /\bwithin the next (\w+ )?(minutes?|hours?)\b/i,
    /\b(being|is being|are being) (drained|emptied|taken|stolen|withdrawn)\b/i,
    /\bin the next (few|couple of|\d+) (minutes?|hours?)\b/i,
  ],
  credential_request: [
    /\b(one[- ]time|verification|security|authori[sz]ation|six[- ]digit|6[- ]digit|confirmation|access) (code|passcode|number)\b/i,
    /\bcode (that )?(we|i)('ve| have)? (just )?(sent|texted)\b/i,
    /\bread (me |out |back )*(the )?(code|digits|numbers)\b/i,
    /\b(confirm|tell me|give me|read)( me)? (the|that|your) code\b/i,
    /\b(pin|password|passcode|cvv|cvc)\b/i,
    /\b(three|3) digits on the back\b/i,
    /\blong number on (the front of )?your card\b/i,
    /\b(card details|full card number|online banking (login|details|password))\b/i,
  ],
  payment_redirect: [
    /\b(safe|secure|holding|protected) account\b/i,
    /\b(gift ?cards?|(itunes|google play|steam|apple) (gift )?(cards?|vouchers?))\b/i,
    /\b(bitcoin|crypto(currency)?|btc|usdt)\b/i,
    /\b(transfer|move|send|withdraw) (all )?(of )?(your|the) (money|funds|savings|balance)\b/i,
    /\bpay (the|a|this) (fine|fee|penalty|amount) (now|today|immediately)\b/i,
    /\b(courier|driver) (will|to) (collect|pick up)\b/i,
  ],
  secrecy: [
    /\b(don'?t|do not) (tell|mention|discuss|speak to|talk to)\b[^.?!]{0,30}\b(anyone|anybody|family|bank|branch|staff|daughter|son|husband|wife)\b/i,
    /\bkeep this (between us|confidential|to yourself|quiet)\b/i,
    /\b(don'?t|do not) (hang up|put the phone down|end the call)\b/i,
    /\bstay on the line\b/i,
    /\b(staff|cashiers?|someone) (at the branch )?(may be|are|is) (involved|in on it)\b/i,
  ],
  remote_access: [
    /\b(anydesk|teamviewer|quick ?support|remote access|screen ?shar(e|ing))\b/i,
    /\b(download|install) (an|this|the|our) (app|application|software|program)\b/i,
  ],
  threat: [
    /\b(arrest(ed)?|warrant|prosecut(e|ed|ion)|bailiffs?|deport(ed|ation)?)\b/i,
    /\b(legal action|court (case|summons)|criminal (case|charges))\b/i,
    /\b(account|card|national insurance number) (will be |has been |is )?(frozen|suspended|blocked|closed)\b/i,
  ],
};

/** Phrases a *legitimate* caller uses. A sentence matching these is not scored as a credential/payment ask. */
const PROTECTIVE = [
  /\b(never|will not|won'?t|would never|will never|don'?t ever) (ask|request)( you)?( for| to)?\b/i,
  /\b(never|don'?t|do not) (share|give out|disclose|read out)\b/i,
  /\bhang up and call\b/i,
  /\bnumber on the back of your card\b/i,
];
const PROTECTIVE_OVERRIDES: TacticId[] = ["credential_request", "payment_redirect", "remote_access"];

export const WEIGHTS: Record<TacticId, number> = {
  credential_request: 45,
  payment_redirect: 40,
  remote_access: 40,
  user_disclosing: 30,
  threat: 25,
  secrecy: 25,
  urgency: 15,
  authority: 10,
};

const HIGH_SEVERITY: TacticId[] = ["credential_request", "payment_redirect", "remote_access", "user_disclosing"];

const DIGIT_WORD = /^(zero|oh|nought|one|two|three|four|five|six|seven|eight|nine|double|triple)$/i;

/**
 * Longest run of consecutive digit tokens ("four eight two", "4 8 2", "482").
 * A run, not a count, so ordinary speech like "oh, no one told me" doesn't look like a code.
 */
export function maxDigitRun(text: string): number {
  let best = 0;
  let run = 0;
  for (const raw of text.split(/[\s,.-]+/)) {
    const tok = raw.replace(/[^\w]/g, "");
    if (!tok) continue;
    if (/^\d+$/.test(tok)) run += tok.length;
    else if (DIGIT_WORD.test(tok)) run += 1;
    else run = 0;
    best = Math.max(best, run);
  }
  return best;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+/).filter(Boolean);
}

/**
 * Detect the user reading out a code. Context matters: after a caller has asked for a code,
 * 3 digits in a row is enough; otherwise it takes 4+ (so phone numbers, prices and dates are less likely to trip it).
 */
function userDisclosing(text: string, askedForCode: boolean): string | null {
  return maxDigitRun(text) >= (askedForCode ? 3 : 4) ? text.trim() : null;
}

export function detectInLine(line: TranscriptLine, askedForCode = false): { hits: TacticHit[]; protective: string[] } {
  const hits: TacticHit[] = [];
  const protective: string[] = [];

  if (line.speaker === "user") {
    const ev = userDisclosing(line.text, askedForCode);
    if (ev) hits.push({ id: "user_disclosing", evidence: ev, lineId: line.id, source: "rules" });
    return { hits, protective };
  }

  for (const s of sentences(line.text)) {
    const isProtective = PROTECTIVE.some((re) => re.test(s));
    if (isProtective) protective.push(s.trim());
    for (const [id, patterns] of Object.entries(CALLER_PATTERNS) as [TacticId, RegExp[]][]) {
      if (isProtective && PROTECTIVE_OVERRIDES.includes(id)) continue;
      for (const re of patterns) {
        const m = s.match(re);
        if (m) {
          hits.push({ id, evidence: m[0], lineId: line.id, source: "rules" });
          break;
        }
      }
    }
  }
  return { hits, protective };
}

export function scoreTactics(ids: Set<TacticId>, protectiveCount: number): number {
  let score = 0;
  for (const id of ids) score += WEIGHTS[id];
  const hasHigh = HIGH_SEVERITY.some((id) => ids.has(id));
  // Authority + a high-severity ask is the classic impersonation pattern.
  if (ids.has("authority") && hasHigh) score += 20;
  // A legitimate caller giving safety advice, with no high-severity ask, stays low.
  if (protectiveCount > 0 && !hasHigh) score = Math.min(score, 15);
  return Math.min(100, score);
}

export function assessWithRules(transcript: TranscriptLine[]): Assessment {
  const tactics: TacticHit[] = [];
  const protective: string[] = [];
  for (const line of transcript) {
    const r = detectInLine(line, tactics.some((t) => t.id === "credential_request"));
    // Keep the first occurrence of each tactic: that's the moment it first appeared in the call.
    for (const h of r.hits) if (!tactics.some((t) => t.id === h.id)) tactics.push(h);
    protective.push(...r.protective);
  }
  const ids = new Set(tactics.map((t) => t.id));
  const risk = scoreTactics(ids, protective.length);
  return { risk, tactics, protective, rationale: rationale(ids, protective.length), source: "rules" };
}

/** Most serious first. Only the top three make it into the rationale, so it stays short enough to whisper. */
const REASONS: [TacticId, string][] = [
  ["user_disclosing", "you've started reading out a code"],
  ["credential_request", "they asked for a code or PIN"],
  ["payment_redirect", "they want money moved or paid in an unusual way"],
  ["remote_access", "they want access to your device"],
  ["threat", "they're making threats"],
  ["secrecy", "they're trying to keep you isolated"],
  ["urgency", "they're rushing you"],
  ["authority", "they claim to be an official organisation"],
];

function rationale(ids: Set<TacticId>, protectiveCount: number): string {
  if (ids.size === 0) {
    return protectiveCount ? "The caller gave standard safety advice. No scam tactics heard." : "No scam tactics heard so far.";
  }
  const parts = REASONS.filter(([id]) => ids.has(id)).map(([, text]) => text).slice(0, 3);
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return joined[0].toUpperCase() + joined.slice(1) + ".";
}
