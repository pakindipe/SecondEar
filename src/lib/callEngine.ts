/**
 * Drives one simulated phone call:
 *   caller speaks (scripted TTS) → assess → maybe whisper → user replies (mic / typed / auto) → assess → ...
 *
 * Framework-agnostic: React subscribes via `subscribe()` and renders `state`.
 */
import type { Assessment, TranscriptLine } from "../shared/types.ts";
import type { Scenario } from "../shared/scenarios.ts";
import { assessWithRules, maxDigitRun } from "../shared/rules.ts";
import {
  answerIsReal,
  buildSummary,
  decideWhisper,
  mergeAssessments,
  parseCommand,
  type CallSummary,
  type Whisper,
  type WhisperState,
} from "./assist.ts";
import { listen, playHangup, playRing, playWhisperChime, speak, sttSupported, type ListenHandle, type SpeakHandle } from "./speech.ts";

export type InputMode = "auto" | "live";

export interface CallState {
  status: "idle" | "ringing" | "active" | "ended";
  phase: "caller" | "whisper" | "user" | "idle";
  scenario: Scenario;
  mode: InputMode;
  transcript: TranscriptLine[];
  /** Index of the scripted turn in progress. */
  turn: number;
  /** Characters of the current line revealed so far (karaoke-style). */
  revealChars: number;
  interim: string;
  rules: Assessment;
  llm: Assessment | null;
  llmPending: boolean;
  llmLatencyMs: number | null;
  llmError: string | null;
  effective: Assessment;
  peakRisk: number;
  riskHistory: { t: number; risk: number }[];
  whispers: Whisper[];
  commands: { t: number; text: string }[];
  summary: CallSummary | null;
  answeredAt: number | null;
  now: number;
  sttError: string | null;
}

/** Number of spoken digits mid-utterance at which we cut in, before the whole code is out. */
const DISCLOSURE_CUT_IN = 3;

const EMPTY: Assessment = { risk: 0, tactics: [], protective: [], rationale: "No scam tactics heard so far.", source: "rules" };

export class CallEngine {
  state: CallState;
  private listeners = new Set<() => void>();
  private lineId = 0;
  private whisperId = 0;
  private aborted = false;
  private currentSpeech: SpeakHandle | null = null;
  private currentListen: ListenHandle | null = null;
  private pendingReply: ((text: string | null) => void) | null = null;
  private whisperState: WhisperState = { warned: new Set(), offeredHangup: false };
  private whisperQueue: { text: string; level: Whisper["level"]; kind: Whisper["kind"] }[] = [];
  private llmSeq = 0;
  private llmInFlight: Promise<void> | null = null;
  private notify: string | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor(
    scenario: Scenario,
    private opts: { mode: InputMode; muted: boolean; speed: number; llmEnabled: boolean },
  ) {
    this.state = {
      status: "idle",
      phase: "idle",
      scenario,
      mode: opts.mode,
      transcript: [],
      turn: 0,
      revealChars: 0,
      interim: "",
      rules: EMPTY,
      llm: null,
      llmPending: false,
      llmLatencyMs: null,
      llmError: null,
      effective: EMPTY,
      peakRisk: 0,
      riskHistory: [],
      whispers: [],
      commands: [],
      summary: null,
      answeredAt: null,
      now: Date.now(),
      sttError: null,
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private elapsed() {
    return this.state.answeredAt ? Date.now() - this.state.answeredAt : 0;
  }

  /* ---------------- lifecycle ---------------- */

  async ring() {
    this.set({ status: "ringing" });
    if (!this.opts.muted) {
      playRing();
      const id = setInterval(() => (this.state.status === "ringing" ? playRing() : clearInterval(id)), 2400);
    }
  }

  async answer() {
    if (this.state.status !== "ringing" && this.state.status !== "idle") return;
    this.set({ status: "active", answeredAt: Date.now() });
    this.tick = setInterval(() => this.set({ now: Date.now() }), 250);
    try {
      await this.run();
    } catch (err) {
      if (!this.aborted) console.error(err);
    }
  }

  /** Hang up from the UI button or a voice command. */
  async hangup(by: CallSummary["endedBy"] = "user") {
    if (this.state.status === "ended") return;
    this.aborted = true;
    this.currentSpeech?.cancel();
    this.currentListen?.stop();
    this.pendingReply?.(null);
    if (this.tick) clearInterval(this.tick);
    if (!this.opts.muted) playHangup();
    // Give an in-flight LLM call a moment so the summary uses the best assessment.
    if (this.llmInFlight) await Promise.race([this.llmInFlight, wait(1500)]);
    const durationMs = this.elapsed();
    this.set({
      status: "ended",
      phase: "idle",
      interim: "",
      summary: buildSummary({
        transcript: this.state.transcript,
        final: this.state.effective,
        peakRisk: this.state.peakRisk,
        whispers: this.state.whispers,
        endedBy: by,
        durationMs,
        callerId: this.state.scenario.callerId,
        notify: this.notify,
      }),
    });
  }

  /** Typed reply, or "use suggested line", while waiting for the user. */
  submitReply(text: string) {
    if (this.currentListen) {
      this.currentListen.stop();
    }
    this.pendingReply?.(text);
  }

  /* ---------------- main loop ---------------- */

  private async run() {
    const { turns } = this.state.scenario;
    for (let i = 0; i < turns.length && !this.aborted; i++) {
      this.set({ turn: i });

      // 1. Caller speaks
      await this.speakLine("caller", turns[i].caller);
      if (this.aborted) return;
      this.assess();
      // Give the LLM a short window so its whisper (if any) lands before the user answers.
      if (this.llmInFlight) await Promise.race([this.llmInFlight, wait(2500)]);
      await this.flushWhispers();
      if (this.aborted) return;

      // 2. User replies
      const reply = await this.getUserReply(turns[i].reply);
      if (this.aborted) return;
      if (reply) await this.handleUserUtterance(reply);
      await this.flushWhispers();
    }
    if (!this.aborted) {
      await wait(600);
      await this.hangup("caller");
    }
  }

  private async speakLine(speaker: "caller" | "user", text: string, cutIn?: (spokenSoFar: string) => boolean): Promise<string> {
    const line: TranscriptLine = { id: ++this.lineId, speaker, text, t: this.elapsed() };
    this.set({ phase: speaker === "caller" ? "caller" : "user", transcript: [...this.state.transcript, line], revealChars: 0 });
    let cutAt: number | null = null;
    const handle = speak(text, speaker, {
      muted: this.opts.muted,
      speed: this.opts.speed,
      onProgress: (chars) => {
        if (cutAt !== null) return;
        this.set({ revealChars: chars });
        if (cutIn?.(text.slice(0, chars))) {
          cutAt = chars;
          handle.cancel();
        }
      },
    });
    this.currentSpeech = handle;
    await handle.done;
    this.currentSpeech = null;
    if (cutAt !== null) {
      // The user was cut off mid-sentence: keep only what was actually said.
      const said = text.slice(0, cutAt).trim() + "…";
      this.set({ transcript: this.state.transcript.map((l) => (l.id === line.id ? { ...l, text: said } : l)), revealChars: said.length });
      return said;
    }
    this.set({ revealChars: text.length });
    return text;
  }

  /** Returns what the user said, and whether it's already been added to the transcript (auto mode). */
  private async getUserReply(suggested: string): Promise<{ text: string; inTranscript: boolean } | null> {
    this.set({ phase: "user", interim: "" });

    if (this.opts.mode === "auto") {
      // Commands are spoken to Second Ear, not the caller, so they don't go into the call transcript.
      if (parseCommand(suggested)) {
        await wait(400 / this.opts.speed);
        return { text: suggested, inTranscript: false };
      }
      await wait(350 / this.opts.speed);
      const said = await this.speakLine("user", suggested, (soFar) => this.shouldCutIn(soFar));
      return { text: said, inTranscript: true };
    }

    // Live mode: microphone (if supported) racing a typed reply.
    return new Promise((resolve) => {
      let done = false;
      const finish = (text: string | null) => {
        if (done) return;
        done = true;
        this.pendingReply = null;
        this.currentListen = null;
        this.set({ interim: "" });
        resolve(text ? { text, inTranscript: false } : null);
      };
      this.pendingReply = finish;
      if (sttSupported()) {
        const h = listen({
          onInterim: (t) => {
            this.set({ interim: t });
            // Real-time cut-in: whisper before the whole code has been read out.
            if (this.shouldCutIn(t) && !parseCommand(t)) h.stop();
          },
          onError: (e) => this.set({ sttError: e === "not-allowed" ? "Microphone blocked. Allow mic access, or type your replies." : `Speech recognition error: ${e}` }),
        });
        this.currentListen = h;
        h.result.then((t) => t !== null && finish(t));
      }
    });
  }

  private async handleUserUtterance({ text: reply, inTranscript }: { text: string; inTranscript: boolean }) {
    if (inTranscript) {
      this.assess();
      return;
    }
    const cmd = parseCommand(reply);
    if (cmd) {
      this.set({ commands: [...this.state.commands, { t: this.elapsed(), text: reply }] });
      return this.runCommand(cmd);
    }
    const line: TranscriptLine = { id: ++this.lineId, speaker: "user", text: reply, t: this.elapsed() };
    this.set({ transcript: [...this.state.transcript, line] });
    this.assess();
  }

  private async runCommand(cmd: NonNullable<ReturnType<typeof parseCommand>>) {
    switch (cmd.kind) {
      case "hangup":
        await this.whisperNow("Ending the call. You did the right thing.", "info", "ack");
        await this.hangup("second_ear");
        return;
      case "is_real":
        if (this.llmInFlight) await Promise.race([this.llmInFlight, wait(2500)]);
        await this.whisperNow(answerIsReal(this.state.effective), this.state.effective.risk >= 70 ? "danger" : "info", "answer");
        return;
      case "notify_family":
        this.notify = cmd.who;
        await this.whisperNow(`Okay. When the call ends I'll send your ${cmd.who} a summary.`, "info", "ack");
        return;
      case "unknown":
        await this.whisperNow("Sorry, I didn't catch that. You can say 'is this real' or 'hang up'.", "info", "ack");
    }
  }

  /**
   * Cut the user off mid-sentence only if they're reading out digits *after* a caller asked for a code.
   * Reading your phone number to a friend shouldn't trigger anything.
   */
  private shouldCutIn(spokenSoFar: string): boolean {
    const askedForCode = this.state.effective.tactics.some((t) => t.id === "credential_request");
    return askedForCode && maxDigitRun(spokenSoFar) >= DISCLOSURE_CUT_IN;
  }

  /* ---------------- assessment ---------------- */

  private assess() {
    const rules = assessWithRules(this.state.transcript);
    this.applyAssessment(rules, this.state.llm);
    if (this.opts.llmEnabled) this.requestLLM();
  }

  private applyAssessment(rules: Assessment, llm: Assessment | null) {
    const effective = mergeAssessments(rules, llm);
    const t = this.elapsed();
    this.set({
      rules,
      llm,
      effective,
      peakRisk: Math.max(this.state.peakRisk, effective.risk),
      riskHistory: [...this.state.riskHistory, { t, risk: effective.risk }],
    });
    const w = decideWhisper(effective, this.whisperState);
    if (w) this.whisperQueue.push({ ...w, kind: "warning" });
  }

  private requestLLM() {
    const seq = ++this.llmSeq;
    const snapshot = this.state.transcript;
    this.set({ llmPending: true });
    const p = fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: snapshot }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as { assessment: Assessment; latencyMs: number };
      })
      .then(({ assessment, latencyMs }) => {
        if (seq !== this.llmSeq || this.state.status === "ended") return; // stale
        this.set({ llmLatencyMs: latencyMs, llmError: null });
        this.applyAssessment(this.state.rules, assessment);
      })
      .catch((err: Error) => this.set({ llmError: err.message }))
      .finally(() => {
        if (seq === this.llmSeq) {
          this.set({ llmPending: false });
          this.llmInFlight = null;
        }
      });
    this.llmInFlight = p;
  }

  /* ---------------- whispers ---------------- */

  private async flushWhispers() {
    while (this.whisperQueue.length && !this.aborted) {
      const w = this.whisperQueue.shift()!;
      await this.whisperNow(w.text, w.level, w.kind);
    }
  }

  private async whisperNow(text: string, level: Whisper["level"], kind: Whisper["kind"]) {
    const prevPhase = this.state.phase;
    const whisper: Whisper = { id: ++this.whisperId, t: this.elapsed(), text, level, kind };
    this.set({ phase: "whisper", whispers: [...this.state.whispers, whisper] });
    if (!this.opts.muted) {
      playWhisperChime();
      await wait(350);
    }
    const h = speak(text, "whisper", { muted: this.opts.muted, speed: this.opts.speed });
    this.currentSpeech = h;
    await h.done;
    this.currentSpeech = null;
    if (!this.aborted) this.set({ phase: prevPhase });
  }
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
