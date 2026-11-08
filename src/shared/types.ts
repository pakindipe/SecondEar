export type Speaker = "caller" | "user";

export interface TranscriptLine {
  id: number;
  speaker: Speaker;
  text: string;
  /** ms since the call was answered */
  t: number;
}

export type TacticId =
  | "authority"
  | "urgency"
  | "credential_request"
  | "payment_redirect"
  | "secrecy"
  | "remote_access"
  | "threat"
  | "user_disclosing";

export interface TacticHit {
  id: TacticId;
  /** The exact phrase that triggered it, for explainability in the UI. */
  evidence: string;
  lineId: number;
  source: "rules" | "llm";
}

export interface Assessment {
  /** 0-100 */
  risk: number;
  tactics: TacticHit[];
  /** Phrases the caller said that look like a legitimate caller's safety advice. */
  protective: string[];
  /** One sentence, plain English. */
  rationale: string;
  source: "rules" | "llm";
}

export const TACTIC_LABELS: Record<TacticId, string> = {
  authority: "Claims authority",
  urgency: "Time pressure",
  credential_request: "Asks for code / PIN",
  payment_redirect: "Money transfer / gift cards",
  secrecy: "Isolation / secrecy",
  remote_access: "Remote access",
  threat: "Threats",
  user_disclosing: "You're giving out a code",
};
