import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SCENARIOS, type Scenario } from "./shared/scenarios.ts";
import { TACTIC_LABELS, type TranscriptLine } from "./shared/types.ts";
import { CallEngine, type InputMode } from "./lib/callEngine.ts";
import { fmtTime, riskLevel, RISK_DANGER, RISK_SUSPICIOUS, type CallSummary } from "./lib/assist.ts";
import { initVoices, sttSupported, ttsSupported, unlockAudio } from "./lib/speech.ts";

type Health = { ok: boolean; llm: "anthropic" | "openai" | null } | null;

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [mode, setMode] = useState<InputMode>("auto");
  const [muted, setMuted] = useState(false);
  const [useLLM, setUseLLM] = useState(true);
  const [health, setHealth] = useState<Health>(null);
  const [engine, setEngine] = useState<CallEngine | null>(null);

  useEffect(() => {
    void initVoices();
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, llm: null }));
  }, []);

  const llmAvailable = !!health?.llm;

  const startCall = () => {
    unlockAudio();
    engine?.hangup();
    const e = new CallEngine(scenario, { mode, muted, speed: muted ? 1.6 : 1, llmEnabled: llmAvailable && useLLM });
    setEngine(e);
    void e.ring();
  };

  const reset = () => {
    engine?.hangup();
    setEngine(null);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◖◗
          </span>
          <div>
            <h1>Second Ear</h1>
            <p>A voice that listens with you, and whispers when a call turns into a scam.</p>
          </div>
        </div>
        <EngineBadge health={health} useLLM={useLLM} />
      </header>

      <main className="grid">
        <aside className="panel setup">
          <h2>1 · Pick a call</h2>
          <ul className="scenarios">
            {SCENARIOS.map((s) => (
              <li key={s.id}>
                <button
                  className={`scenario ${s.id === scenario.id ? "selected" : ""}`}
                  onClick={() => setScenario(s)}
                >
                  <span className={`tag ${s.isScam ? "scam" : "legit"}`}>{s.isScam ? "scam" : "genuine"}</span>
                  <strong>{s.title}</strong>
                  <small>{s.blurb}</small>
                </button>
              </li>
            ))}
          </ul>

          <h2>2 · How you'll answer</h2>
          <div className="seg">
            <button className={mode === "auto" ? "on" : ""} onClick={() => setMode("auto")}>
              Auto demo
            </button>
            <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>
              Live mic
            </button>
          </div>
          <p className="hint">
            {mode === "auto"
              ? "Both sides of the call are played for you. Best for a first look."
              : sttSupported()
                ? "You play the person who answered. Speak your replies, or type them. Headphones help, so the mic doesn't hear the caller."
                : "This browser has no speech recognition (use Chrome or Edge). You can still type replies."}
          </p>

          <label className="check">
            <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} /> Sound on
            {!ttsSupported() && <em> (not supported here)</em>}
          </label>
          <label className={`check ${llmAvailable ? "" : "disabled"}`}>
            <input type="checkbox" checked={llmAvailable && useLLM} disabled={!llmAvailable} onChange={(e) => setUseLLM(e.target.checked)} />{" "}
            LLM risk engine {llmAvailable ? `(${health?.llm})` : "(add an API key to .env)"}
          </label>

          <button className="primary big" onClick={startCall}>
            {engine ? "Restart call" : "Start incoming call"}
          </button>
        </aside>

        {engine ? <CallView engine={engine} onReset={reset} /> : <Intro />}
      </main>
    </div>
  );
}

function EngineBadge({ health, useLLM }: { health: Health; useLLM: boolean }) {
  if (!health) return <span className="badge">connecting…</span>;
  if (!health.ok) return <span className="badge warn">API offline: rules only</span>;
  return <span className="badge ok">Risk engine: rules{health.llm && useLLM ? ` + ${health.llm}` : " only"}</span>;
}

function Intro() {
  return (
    <section className="panel intro">
      <h2>Why a voice, mid-call?</h2>
      <ul>
        <li>
          <b>Your eyes are busy.</b> The phone is against your ear. A pop-up warning on the screen is invisible at the exact moment it matters.
        </li>
        <li>
          <b>It happens in seconds.</b> The dangerous moment is when the caller asks for the code. A warning after the call is too late.
        </li>
        <li>
          <b>Panic travels by voice.</b> Scammers use tone and urgency. A calm voice in the same channel is the most direct counter to that.
        </li>
        <li>
          <b>The people most targeted are often the least app-savvy.</b> Talking is the one interface everyone already knows.
        </li>
      </ul>
      <p className="muted">
        Pick a call on the left and press <b>Start incoming call</b>. Listen for the soft chime: that's Second Ear whispering to you, not the
        caller.
      </p>
    </section>
  );
}

function useEngine(engine: CallEngine) {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.state,
  );
}

function CallView({ engine, onReset }: { engine: CallEngine; onReset: () => void }) {
  const s = useEngine(engine);
  const level = riskLevel(s.effective.risk);
  const elapsed = s.answeredAt ? (s.status === "ended" ? (s.summary?.durationMs ?? 0) : s.now - s.answeredAt) : 0;
  const lastWhisper = s.whispers[s.whispers.length - 1];

  return (
    <>
      <section className={`panel phone level-${level}`}>
        <div className="caller-head">
          <div className="avatar" aria-hidden>
            {s.scenario.callerId.slice(0, 1)}
          </div>
          <div>
            <div className="callerid">{s.scenario.callerId}</div>
            <div className="number">{s.scenario.number}</div>
          </div>
          <div className="status">
            {s.status === "ringing" && <span className="pulse">Incoming call…</span>}
            {s.status === "active" && <span>{fmtTime(elapsed)}</span>}
            {s.status === "ended" && <span>Call ended · {fmtTime(elapsed)}</span>}
          </div>
        </div>

        {s.status === "ringing" && (
          <div className="ringing">
            <button className="answer" onClick={() => void engine.answer()}>
              Answer
            </button>
            <button className="decline" onClick={() => void engine.hangup("user")}>
              Decline
            </button>
          </div>
        )}

        {s.status === "active" && (
          <>
            <div className={`ear ${s.phase === "whisper" ? "speaking" : ""} ${lastWhisper ? lastWhisper.level : ""}`} aria-live="polite">
              <span className="ear-label">{s.phase === "whisper" ? "Second Ear is whispering" : "Second Ear is listening"}</span>
              <p>{s.phase === "whisper" && lastWhisper ? lastWhisper.text : s.effective.rationale}</p>
            </div>
            {s.mode === "live" && s.phase === "user" && <ReplyBox engine={engine} suggestion={s.scenario.turns[s.turn]?.reply ?? ""} interim={s.interim} error={s.sttError} />}
            <div className="who">
              {s.phase === "caller" && "Caller is speaking…"}
              {s.phase === "user" && (s.mode === "auto" ? "You are replying…" : "Your turn to speak")}
              {s.phase === "whisper" && "Only you can hear this"}
            </div>
            <button className="hangup" onClick={() => void engine.hangup("user")}>
              Hang up
            </button>
          </>
        )}

        {s.status === "ended" && s.summary && <Summary summary={s.summary} onReset={onReset} />}
      </section>

      <section className="panel analysis">
        <RiskMeter risk={s.effective.risk} history={s.riskHistory} pending={s.llmPending} />
        <p className="rationale">{s.effective.rationale}</p>
        <div className="chips">
          {s.effective.tactics.length === 0 && <span className="muted">No scam tactics yet.</span>}
          {s.effective.tactics.map((t) => (
            <span key={t.id} className={`chip ${t.id}`} title={`"${t.evidence}" (${t.source})`}>
              {TACTIC_LABELS[t.id]}
              <q>{t.evidence}</q>
              {t.source === "llm" && <i>LLM</i>}
            </span>
          ))}
          {s.effective.protective.length > 0 && (
            <span className="chip protective" title={s.effective.protective.join(" / ")}>
              Gave safety advice
              <q>{s.effective.protective[0]}</q>
            </span>
          )}
        </div>
        <EngineDetail s={s} />
        <Transcript lines={s.transcript} revealChars={s.revealChars} whispers={s.whispers} commands={s.commands} />
      </section>
    </>
  );
}

function ReplyBox({ engine, suggestion, interim, error }: { engine: CallEngine; suggestion: string; interim: string; error: string | null }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="reply">
      {sttSupported() && (
        <div className="mic">
          <span className="dot" /> {interim || "Listening… say your reply"}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) engine.submitReply(text.trim());
          setText("");
        }}
      >
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or type a reply" />
        <button type="submit">Send</button>
      </form>
      {suggestion && (
        <button className="suggest" onClick={() => engine.submitReply(suggestion)}>
          Suggested: “{suggestion}”
        </button>
      )}
      <small className="muted">Talk to Second Ear by starting with “Second Ear, …”: “is this real?”, “hang up”, “tell my daughter”.</small>
    </div>
  );
}

function RiskMeter({ risk, history, pending }: { risk: number; history: { t: number; risk: number }[]; pending: boolean }) {
  const level = riskLevel(risk);
  const label = level === "danger" ? "Likely scam" : level === "suspicious" ? "Suspicious" : "No concerns";
  const pts = useMemo(() => {
    const data = [{ t: 0, risk: 0 }, ...history];
    const maxT = Math.max(1, data[data.length - 1].t);
    return data.map((d) => `${(d.t / maxT) * 100},${30 - (d.risk / 100) * 30}`).join(" ");
  }, [history]);
  return (
    <div className={`meter level-${level}`}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-num">
          {risk}
          <small>/100</small>
          {pending && <span className="spinner" title="LLM assessing" />}
        </span>
      </div>
      <div className="bar">
        <div className="fill" style={{ width: `${risk}%` }} />
        <div className="tick" style={{ left: `${RISK_SUSPICIOUS}%` }} />
        <div className="tick" style={{ left: `${RISK_DANGER}%` }} />
      </div>
      <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
        <polyline points={pts} />
      </svg>
    </div>
  );
}

function EngineDetail({ s }: { s: CallEngine["state"] }) {
  return (
    <details className="engines">
      <summary>Engine detail</summary>
      <div>
        Rules: <b>{s.rules.risk}</b> · {s.rules.tactics.length} hits
      </div>
      <div>
        LLM: {s.llm ? <b>{s.llm.risk}</b> : "–"}
        {s.llmLatencyMs !== null && <> · {s.llmLatencyMs} ms</>}
        {s.llmError && <span className="error"> · {s.llmError}</span>}
      </div>
      <div className="muted">Effective risk = max(rules, LLM). Whispers fire at ≥{RISK_SUSPICIOUS}; hang-up offered at ≥{RISK_DANGER}.</div>
    </details>
  );
}

type Row =
  | { kind: "line"; t: number; line: TranscriptLine }
  | { kind: "whisper"; t: number; text: string; level: string }
  | { kind: "command"; t: number; text: string };

// Tie-break for rows logged in the same millisecond: a command comes before the whisper that answers it.
const ORDER: Record<Row["kind"], number> = { line: 0, command: 1, whisper: 2 };

function Transcript({
  lines,
  revealChars,
  whispers,
  commands,
}: {
  lines: TranscriptLine[];
  revealChars: number;
  whispers: { t: number; text: string; level: string }[];
  commands: { t: number; text: string }[];
}) {
  const end = useRef<HTMLDivElement>(null);
  const rows: Row[] = [
    ...lines.map((line) => ({ kind: "line" as const, t: line.t, line })),
    ...whispers.map((w) => ({ kind: "whisper" as const, t: w.t, text: w.text, level: w.level })),
    ...commands.map((c) => ({ kind: "command" as const, t: c.t, text: c.text })),
  ].sort((a, b) => a.t - b.t || ORDER[a.kind] - ORDER[b.kind]);
  const lastId = lines[lines.length - 1]?.id;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [rows.length, revealChars]);

  return (
    <div className="transcript">
      {rows.map((r, i) => {
        if (r.kind === "whisper")
          return (
            <div key={`w${i}`} className={`row whisper ${r.level}`}>
              <span className="who">Second Ear → you</span>
              {r.text}
            </div>
          );
        if (r.kind === "command")
          return (
            <div key={`c${i}`} className="row command">
              <span className="who">You → Second Ear</span>
              {r.text}
            </div>
          );
        const text = r.line.id === lastId ? r.line.text.slice(0, revealChars) : r.line.text;
        return (
          <div key={`l${r.line.id}`} className={`row ${r.line.speaker}`}>
            <span className="who">
              {r.line.speaker === "caller" ? "Caller" : "You"} <time>{fmtTime(r.t)}</time>
            </span>
            {text}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function Summary({ summary, onReset }: { summary: CallSummary; onReset: () => void }) {
  const title = summary.verdict === "scam" ? "Likely scam call" : summary.verdict === "suspicious" ? "Suspicious call" : "Normal call";
  const endedBy = { second_ear: "Second Ear ended the call for you", user: "You hung up", caller: "The caller hung up" }[summary.endedBy];
  return (
    <div className={`summary ${summary.verdict}`}>
      <h3>{title}</h3>
      <p className="muted">
        {endedBy} · peak risk {summary.peakRisk}/100 · {summary.whispers} warning{summary.whispers === 1 ? "" : "s"} whispered
      </p>
      {summary.tactics.length > 0 && (
        <ul className="tactics">
          {summary.tactics.map((t) => (
            <li key={t.id}>
              <time>{fmtTime(t.t)}</time> <b>{t.label}</b> <q>{t.evidence}</q>
            </li>
          ))}
        </ul>
      )}
      <h4>What to do now</h4>
      <ul>
        {summary.actions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {summary.familyMessage && (
        <>
          <h4>Message for family / carer</h4>
          <blockquote>{summary.familyMessage}</blockquote>
        </>
      )}
      <button className="primary" onClick={onReset}>
        Try another call
      </button>
    </div>
  );
}
