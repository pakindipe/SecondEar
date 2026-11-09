import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SCENARIOS, type Scenario } from "./shared/scenarios.ts";
import { TACTIC_LABELS, type TranscriptLine } from "./shared/types.ts";
import { CallEngine, type CallState, type InputMode } from "./lib/callEngine.ts";
import { fmtTime, riskLevel, RISK_DANGER, RISK_SUSPICIOUS, type CallSummary } from "./lib/assist.ts";
import { initVoices, sttSupported, unlockAudio } from "./lib/speech.ts";

type Health = { ok: boolean; llm: "anthropic" | "openai" | null } | null;

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [mode, setMode] = useState<InputMode>("auto");
  const [muted, setMuted] = useState(false);
  const [health, setHealth] = useState<Health>(null);
  const [engine, setEngine] = useState<CallEngine | null>(null);

  useEffect(() => {
    void initVoices();
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, llm: null }));
  }, []);

  const startCall = () => {
    unlockAudio();
    engine?.hangup();
    // The LLM engine switches on by itself when the server has an API key. Nothing for the user to configure.
    const e = new CallEngine(scenario, { mode, muted, speed: muted ? 1.6 : 1, llmEnabled: !!health?.llm });
    setEngine(e);
    void e.ring();
  };

  const reset = () => {
    engine?.hangup();
    setEngine(null);
  };

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>Second Ear</h1>
          <p>Listens to the call with you, and whispers when it turns into a scam.</p>
        </div>
        <EngineStatus health={health} />
      </header>

      <main className="layout">
        <aside className="controls">
          <h2 className="eyebrow">Choose a call</h2>
          <ol className="calls">
            {SCENARIOS.map((s, i) => (
              <li key={s.id}>
                <button className={s.id === scenario.id ? "selected" : ""} onClick={() => setScenario(s)} aria-pressed={s.id === scenario.id}>
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="call-text">
                    <span className="call-title">{s.title}</span>
                    <span className="call-blurb">{s.blurb}</span>
                    <span className={`call-kind ${s.isScam ? "scam" : "genuine"}`}>{s.isScam ? "Scam" : "Genuine"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <h2 className="eyebrow">You answer by</h2>
          <div className="choice" role="radiogroup">
            <label>
              <input type="radio" name="mode" checked={mode === "auto"} onChange={() => setMode("auto")} />
              <span>
                <b>Watching</b>
                <small>Both sides are played for you.</small>
              </span>
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === "live"} onChange={() => setMode("live")} />
              <span>
                <b>Speaking</b>
                <small>{sttSupported() ? "Use your mic (headphones help) or type." : "No speech recognition in this browser, so you'll type."}</small>
              </span>
            </label>
          </div>

          <label className="toggle">
            <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
            <span>Play audio</span>
          </label>

          <button className="start" onClick={startCall}>
            {engine ? "Restart the call" : "Start incoming call"}
          </button>
        </aside>

        <Handset engine={engine} onReset={reset} />

        <section className="report">{engine ? <Report engine={engine} /> : <Intro />}</section>
      </main>
    </div>
  );
}

function EngineStatus({ health }: { health: Health }) {
  const text = !health
    ? "connecting…"
    : !health.ok
      ? "server offline · rules only"
      : health.llm
        ? `rules + ${health.llm === "anthropic" ? "Claude" : "OpenAI"}`
        : "rules engine · runs offline";
  return (
    <p className="engine-status">
      <span className={`led ${health?.ok ? "on" : ""}`} aria-hidden />
      {text}
    </p>
  );
}

const NULL_STATE = { subscribe: () => () => {}, get: () => null };

function useEngine(engine: CallEngine | null): CallState | null {
  return useSyncExternalStore(
    engine ? (cb) => engine.subscribe(cb) : NULL_STATE.subscribe,
    engine ? () => engine.state : NULL_STATE.get,
  );
}

/* ------------------------------------------------------------------ */
/* The phone                                                           */
/* ------------------------------------------------------------------ */

function Handset({ engine, onReset }: { engine: CallEngine | null; onReset: () => void }) {
  const s = useEngine(engine);
  const level = s ? riskLevel(s.effective.risk) : "safe";
  const lastWhisper = s?.whispers[s.whispers.length - 1];
  const whispering = s?.status === "active" && s.phase === "whisper" && lastWhisper ? lastWhisper : null;
  const listening = s?.status === "active";

  return (
    <div className={`handset level-${level}`}>
      <div className={`screen ${s ? `status-${s.status}` : "status-idle"}`}>
        <StatusBar />
        <DynamicIsland listening={!!listening} whisper={whispering} level={level} />
        {!s || !engine ? <IdleScreen /> : <CallScreen s={s} engine={engine} onReset={onReset} />}
        <div className="home-indicator" aria-hidden />
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="statusbar" aria-hidden>
      <span className="clock">9:41</span>
      <span className="status-icons">
        <svg viewBox="0 0 18 12" width="18" height="12">
          <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 16 12" width="16" height="12">
          <path fill="currentColor" d="M8 2.6c2.2 0 4.2.9 5.7 2.3l1.1-1.1A9.6 9.6 0 0 0 8 1 9.6 9.6 0 0 0 1.2 3.8l1.1 1.1A8 8 0 0 1 8 2.6zm0 3.3c1.3 0 2.5.5 3.4 1.3l1.1-1.1A6.3 6.3 0 0 0 8 4.3a6.3 6.3 0 0 0-4.5 1.8l1.1 1.1c.9-.8 2.1-1.3 3.4-1.3zM8 9.2c.5 0 .9.2 1.2.5L8 11 6.8 9.7c.3-.3.7-.5 1.2-.5z" />
        </svg>
        <svg viewBox="0 0 27 12" width="27" height="12">
          <rect x="0.5" y="0.5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor" />
          <path d="M25 4v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Second Ear as a Live Activity in the Dynamic Island: a small waveform while it listens,
 * expanding into a banner when it whispers. This is how a real iOS version would surface it.
 */
function DynamicIsland({ listening, whisper, level }: { listening: boolean; whisper: { text: string; level: string } | null; level: string }) {
  return (
    <div className={`island ${whisper ? "expanded" : listening ? "compact" : ""} ${whisper?.level ?? ""}`} aria-live="polite">
      {whisper ? (
        <div className="island-body">
          <div className="island-head">
            <span className="app-glyph" aria-hidden>
              <svg viewBox="0 0 20 20" width="20" height="20">
                <path d="M10 3.5a5 5 0 0 1 5 5c0 2.2-1.4 3-2.2 3.8-.6.6-.8 1.2-.8 2a2.5 2.5 0 0 1-4.6 1.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M7.6 8.6a2.4 2.4 0 0 1 4.8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="island-app">Second Ear</span>
            <span className="island-meta">only you hear this</span>
          </div>
          <p className="island-text">{whisper.text}</p>
        </div>
      ) : listening ? (
        <>
          <span className={`island-dot level-${level}`} aria-hidden />
          <span className="island-wave" aria-label="Second Ear is listening">
            <i />
            <i />
            <i />
            <i />
          </span>
        </>
      ) : null}
    </div>
  );
}

function IdleScreen() {
  return (
    <div className="idle">
      <p>No call</p>
      <small>Choose a call and press start.</small>
    </div>
  );
}

function CallScreen({ s, engine, onReset }: { s: CallState; engine: CallEngine; onReset: () => void }) {
  const elapsed = s.answeredAt ? (s.status === "ended" ? (s.summary?.durationMs ?? 0) : s.now - s.answeredAt) : 0;
  const showReply = s.mode === "live" && s.phase === "user";

  return (
    <div className="call">
      <div className="caller-block">
        {s.status === "ringing" && <div className="caller-sub">mobile</div>}
        <div className="caller-name">{s.scenario.callerId}</div>
        <div className="caller-sub">
          {s.status === "ringing" && s.scenario.number}
          {s.status === "active" && fmtTime(elapsed)}
          {s.status === "ended" && `Call Ended · ${fmtTime(elapsed)}`}
        </div>
      </div>

      {s.status === "ringing" && (
        <div className="ring-actions">
          <div className="minor-actions" aria-hidden>
            <span>
              <Icon name="alarm" />
              Remind Me
            </span>
            <span>
              <Icon name="message" />
              Message
            </span>
          </div>
          <div className="major-actions">
            <CallButton kind="decline" label="Decline" onClick={() => void engine.hangup("user")} />
            <CallButton kind="accept" label="Accept" onClick={() => void engine.answer()} />
          </div>
        </div>
      )}

      {s.status === "active" && (
        <div className="in-call">
          {showReply ? (
            <ReplyBox engine={engine} suggestion={s.scenario.turns[s.turn]?.reply ?? ""} interim={s.interim} error={s.sttError} />
          ) : (
            <div className="grid-buttons" aria-hidden>
              {(
                [
                  ["mute", "mute"],
                  ["keypad", "keypad"],
                  ["speaker", "audio"],
                  ["plus", "add call"],
                  ["video", "FaceTime"],
                  ["person", "contacts"],
                ] as const
              ).map(([icon, label]) => (
                <span key={label} className="grid-btn">
                  <span className="grid-disc">
                    <Icon name={icon} />
                  </span>
                  {label}
                </span>
              ))}
            </div>
          )}
          <div className="end-row">
            <CallButton kind="decline" label="" onClick={() => void engine.hangup("user")} aria="End call" />
          </div>
        </div>
      )}

      {s.status === "ended" && s.summary && (
        <div className="ended">
          <p className={`verdict ${s.summary.verdict}`}>{verdictTitle(s.summary)}</p>
          <p className="ended-sub">{endedByText(s.summary)}</p>
          <button className="again" onClick={onReset}>
            Try another call
          </button>
        </div>
      )}
    </div>
  );
}

function CallButton({ kind, label, onClick, aria }: { kind: "accept" | "decline"; label: string; onClick: () => void; aria?: string }) {
  return (
    <button className={`call-btn ${kind}`} onClick={onClick} aria-label={aria ?? label}>
      <span className="disc" aria-hidden>
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path
            fill="currentColor"
            d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"
          />
        </svg>
      </span>
      {label && <span className="call-btn-label">{label}</span>}
    </button>
  );
}

type IconName = "mute" | "keypad" | "speaker" | "plus" | "video" | "person" | "alarm" | "message";

/** Simple hand-drawn icons in the spirit of the iOS call screen (SF Symbols can't be used on the web). */
function Icon({ name }: { name: IconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
      {name === "mute" && (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" {...p} />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" {...p} />
        </>
      )}
      {name === "keypad" &&
        [6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => <circle key={`${x}${y}`} cx={x} cy={y - 1} r="1.6" fill="currentColor" />))}
      {name === "speaker" && (
        <>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...p} />
          <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" {...p} />
        </>
      )}
      {name === "plus" && <path d="M12 5v14M5 12h14" {...p} />}
      {name === "video" && (
        <>
          <rect x="3" y="7" width="12" height="10" rx="2.5" {...p} />
          <path d="M15 10.5l5-3v9l-5-3z" {...p} />
        </>
      )}
      {name === "person" && (
        <>
          <circle cx="12" cy="8.5" r="3.5" {...p} />
          <path d="M5 19.5a7 7 0 0 1 14 0" {...p} />
        </>
      )}
      {name === "alarm" && (
        <>
          <circle cx="12" cy="13" r="7" {...p} />
          <path d="M12 9.5V13l2.5 1.5M5 4.5 3 6.5M19 4.5l2 2" {...p} />
        </>
      )}
      {name === "message" && <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z" {...p} />}
    </svg>
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
      {sttSupported() && <p className="heard">{interim ? `“${interim}”` : "Listening…"}</p>}
      {error && <p className="error">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) engine.submitReply(text.trim());
          setText("");
        }}
      >
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="or type a reply" aria-label="Type a reply" />
      </form>
      {suggestion && (
        <button className="suggest" onClick={() => engine.submitReply(suggestion)}>
          Say: “{suggestion}”
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The report column                                                   */
/* ------------------------------------------------------------------ */

function Intro() {
  return (
    <div className="intro">
      <h2>Why a voice, in the middle of a call?</h2>
      <p className="lede">
        Call blocking works before the phone rings. The scams that get through do their damage during the conversation: a calm, official
        voice, then panic, then the ask.
      </p>
      <dl>
        <dt>Eyes busy</dt>
        <dd>The phone is against your ear. A warning on the screen is invisible at the moment it matters.</dd>
        <dt>Seconds count</dt>
        <dd>The dangerous moment is when the code is requested. A warning after the call is too late.</dd>
        <dt>Same channel</dt>
        <dd>Scammers work through tone and urgency. A calm voice in your ear answers them where the pressure is.</dd>
        <dt>Nothing to learn</dt>
        <dd>The people most targeted are often the least comfortable with apps. Speaking needs no menu.</dd>
      </dl>
      <p className="note">
        Listen for the two-note chime. That's Second Ear speaking to you, not the caller. You can talk back: <i>“Second Ear, is this real?”</i>,{" "}
        <i>“Second Ear, hang up.”</i>
      </p>
    </div>
  );
}

function Report({ engine }: { engine: CallEngine }) {
  const s = useEngine(engine)!;
  return (
    <>
      <Risk risk={s.effective.risk} pending={s.llmPending} rationale={s.effective.rationale} />
      {s.summary && <Summary summary={s.summary} />}
      <Heard s={s} />
      <h3 className="eyebrow">Transcript</h3>
      <Transcript lines={s.transcript} revealChars={s.revealChars} whispers={s.whispers} commands={s.commands} />
      <EngineDetail s={s} />
    </>
  );
}

function Risk({ risk, pending, rationale }: { risk: number; pending: boolean; rationale: string }) {
  const level = riskLevel(risk);
  const label = level === "danger" ? "Likely scam" : level === "suspicious" ? "Suspicious" : "Nothing worrying";
  return (
    <div className={`risk level-${level}`}>
      <div className="risk-head">
        <span className="risk-label">{label}</span>
        <span className="risk-num">
          {risk}
          {pending && <span className="pending" title="LLM is assessing" />}
        </span>
      </div>
      <div className="scale" role="meter" aria-valuenow={risk} aria-valuemin={0} aria-valuemax={100} aria-label="Scam risk">
        <span className="zone z1" style={{ width: `${RISK_SUSPICIOUS}%` }} />
        <span className="zone z2" style={{ width: `${RISK_DANGER - RISK_SUSPICIOUS}%` }} />
        <span className="zone z3" style={{ width: `${100 - RISK_DANGER}%` }} />
        <span className="marker" style={{ left: `${risk}%` }} />
      </div>
      <div className="scale-labels" aria-hidden>
        <span style={{ width: `${RISK_SUSPICIOUS}%` }}>fine</span>
        <span style={{ width: `${RISK_DANGER - RISK_SUSPICIOUS}%` }}>whispers</span>
        <span style={{ width: `${100 - RISK_DANGER}%` }}>offers to hang up</span>
      </div>
      <p className="rationale">{rationale}</p>
    </div>
  );
}

function Heard({ s }: { s: CallState }) {
  const tByLine = new Map(s.transcript.map((l) => [l.id, l.t]));
  if (s.effective.tactics.length === 0 && s.effective.protective.length === 0) return null;
  return (
    <>
      <h3 className="eyebrow">What it picked up</h3>
      <ul className="heard-list">
        {s.effective.tactics.map((t) => (
          <li key={t.id}>
            <time>{fmtTime(tByLine.get(t.lineId) ?? 0)}</time>
            <span className="tactic">
              {TACTIC_LABELS[t.id]}
              {t.source === "llm" && <sup>LLM</sup>}
            </span>
            <q>{t.evidence}</q>
          </li>
        ))}
        {s.effective.protective.length > 0 && (
          <li className="protective">
            <time>·</time>
            <span className="tactic">Safety advice (not counted)</span>
            <q>{s.effective.protective[0]}</q>
          </li>
        )}
      </ul>
    </>
  );
}

function EngineDetail({ s }: { s: CallState }) {
  return (
    <details className="engine-detail">
      <summary>How the score was made</summary>
      <p>
        Rules engine: <b>{s.rules.risk}</b>. LLM engine: {s.llm ? <b>{s.llm.risk}</b> : "not running"}
        {s.llmLatencyMs !== null && ` (${s.llmLatencyMs} ms)`}
        {s.llmError && <span className="error"> · {s.llmError}</span>}.
      </p>
      <p>
        The score shown is the higher of the two. Second Ear whispers from {RISK_SUSPICIOUS} and offers to hang up from {RISK_DANGER}.
      </p>
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

  if (rows.length === 0) return <p className="dim">Waiting for the call to be answered.</p>;

  return (
    <div className="script">
      {rows.map((r, i) => {
        if (r.kind === "whisper")
          return (
            <div key={`w${i}`} className={`line whisper ${r.level}`}>
              <span className="speaker">Second Ear</span>
              <p>{r.text}</p>
            </div>
          );
        if (r.kind === "command")
          return (
            <div key={`c${i}`} className="line command">
              <span className="speaker">You, to Second Ear</span>
              <p>{r.text}</p>
            </div>
          );
        const text = r.line.id === lastId ? r.line.text.slice(0, revealChars) : r.line.text;
        return (
          <div key={`l${r.line.id}`} className={`line ${r.line.speaker}`}>
            <span className="speaker">
              {r.line.speaker === "caller" ? "Caller" : "You"}
              <time>{fmtTime(r.t)}</time>
            </span>
            <p>{text}</p>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

function verdictTitle(s: CallSummary) {
  return s.verdict === "scam" ? "Likely scam" : s.verdict === "suspicious" ? "Suspicious call" : "Normal call";
}

function endedByText(s: CallSummary) {
  return { second_ear: "Second Ear ended it for you", user: "You hung up", caller: "The caller hung up" }[s.endedBy];
}

function Summary({ summary }: { summary: CallSummary }) {
  return (
    <div className={`summary ${summary.verdict}`}>
      <h3 className="eyebrow">After the call</h3>
      <p className="summary-line">
        <b>{verdictTitle(summary)}.</b> {endedByText(summary)}. {summary.whispers} warning{summary.whispers === 1 ? "" : "s"} whispered.
      </p>
      <ul className="actions">
        {summary.actions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      {summary.familyMessage && (
        <figure className="family">
          <figcaption>Ready to send to family or a carer</figcaption>
          <blockquote>{summary.familyMessage}</blockquote>
        </figure>
      )}
    </div>
  );
}
