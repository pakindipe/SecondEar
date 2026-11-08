/**
 * Thin wrappers over the Web Speech API (speechSynthesis + SpeechRecognition).
 * Both are built into Chrome/Edge, so the prototype needs no API keys for audio.
 *
 * speechSynthesis is unreliable about firing `onend` (it never fires in some headless/muted
 * setups), so every utterance also has a duration-based fallback timer.
 */

export type VoiceRole = "caller" | "whisper" | "user";

const ROLE_SETTINGS: Record<VoiceRole, { rate: number; pitch: number; volume: number }> = {
  caller: { rate: 1.0, pitch: 0.9, volume: 1.0 },
  // The whisper is quieter and a touch faster: it should feel like a voice in your ear, not a third party on the line.
  whisper: { rate: 1.08, pitch: 1.1, volume: 0.75 },
  user: { rate: 1.0, pitch: 1.05, volume: 0.85 },
};

const VOICE_PREFS: Record<VoiceRole, RegExp[]> = {
  caller: [/Google UK English Male/i, /Daniel/i, /Arthur/i, /en-GB.*Male/i, /Male/i],
  whisper: [/Google UK English Female/i, /Serena/i, /Kate/i, /Martha/i, /Samantha/i, /Female/i],
  user: [/Google US English/i, /Karen/i, /Moira/i, /Tessa/i],
};

let voicesCache: SpeechSynthesisVoice[] = [];
const chosen: Partial<Record<VoiceRole, SpeechSynthesisVoice | null>> = {};

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function initVoices(): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  return new Promise((resolve) => {
    const load = () => {
      voicesCache = speechSynthesis.getVoices();
      if (voicesCache.length) {
        pickVoices();
        resolve();
      }
    };
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    setTimeout(resolve, 1500); // some browsers expose no voices at all
  });
}

function pickVoices() {
  const english = voicesCache.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const used = new Set<string>();
  for (const role of ["caller", "whisper", "user"] as VoiceRole[]) {
    let pick: SpeechSynthesisVoice | undefined;
    for (const re of VOICE_PREFS[role]) {
      pick = english.find((v) => re.test(`${v.name} ${v.lang}`) && !used.has(v.name));
      if (pick) break;
    }
    pick ??= english.find((v) => !used.has(v.name)) ?? english[0];
    if (pick) used.add(pick.name);
    chosen[role] = pick ?? null;
  }
}

export function estimateMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).length;
  return (words / (2.6 * rate)) * 1000 + 300;
}

export interface SpeakHandle {
  done: Promise<void>;
  cancel: () => void;
}

/**
 * Speak `text`. `onProgress` receives the number of characters spoken so far (for word-by-word reveal).
 * With `muted`, nothing is played but timing and progress are simulated (at `speed`x).
 */
export function speak(
  text: string,
  role: VoiceRole,
  opts: { muted?: boolean; speed?: number; onProgress?: (chars: number) => void } = {},
): SpeakHandle {
  const s = ROLE_SETTINGS[role];
  const speed = opts.speed ?? 1;
  const est = estimateMs(text, s.rate) / speed;
  let finished = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    opts.onProgress?.(text.length);
    resolveDone();
  };

  // Simulated word-by-word progress, used when muted or when the browser doesn't fire boundary events.
  const simulateProgress = () => {
    const words = [...text.matchAll(/\S+/g)];
    words.forEach((m, i) => {
      timers.push(setTimeout(() => !finished && opts.onProgress?.(m.index! + m[0].length), (est * (i + 1)) / words.length));
    });
  };

  if (opts.muted || !ttsSupported()) {
    simulateProgress();
    timers.push(setTimeout(finish, est));
  } else {
    const u = new SpeechSynthesisUtterance(text);
    const v = chosen[role];
    if (v) u.voice = v;
    u.lang = v?.lang ?? "en-GB";
    u.rate = s.rate;
    u.pitch = s.pitch;
    u.volume = s.volume;
    let gotBoundary = false;
    u.onboundary = (e) => {
      gotBoundary = true;
      opts.onProgress?.(e.charIndex + (e.charLength || 0));
    };
    const startedAt = Date.now();
    u.onend = finish;
    // If synthesis fails (no voices installed, autoplay blocked), keep the call at a natural pace
    // instead of racing through it: fall back to simulated timing for the rest of the line.
    u.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return finish();
      const remaining = est - (Date.now() - startedAt);
      if (remaining <= 0) return finish();
      if (!gotBoundary) simulateProgress();
      timers.push(setTimeout(finish, remaining));
    };
    // If no boundary events arrive quickly, fall back to simulated reveal.
    timers.push(setTimeout(() => !gotBoundary && simulateProgress(), 400));
    timers.push(setTimeout(finish, est * 1.8 + 1500));
    speechSynthesis.speak(u);
  }

  return {
    done,
    cancel: () => {
      if (ttsSupported()) speechSynthesis.cancel();
      finish();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Speech recognition                                                  */
/* ------------------------------------------------------------------ */

// Minimal typings: SpeechRecognition isn't in TS's DOM lib.
interface SRResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: SRResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSR(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttSupported(): boolean {
  return typeof window !== "undefined" && getSR() !== null;
}

export interface ListenHandle {
  /** Resolves with the final transcript, or null on silence / error / cancel. */
  result: Promise<string | null>;
  stop: () => void;
}

export function listen(opts: { onInterim?: (text: string) => void; onError?: (err: string) => void; silenceMs?: number }): ListenHandle {
  const Ctor = getSR();
  if (!Ctor) return { result: Promise.resolve(null), stop: () => {} };

  const rec = new Ctor();
  rec.lang = "en-GB";
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = "";
  let latest = ""; // final + interim, so stopping mid-word still returns what was heard
  let settled = false;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (v: string | null) => void;
  const result = new Promise<string | null>((r) => (resolve = r));

  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(silenceTimer);
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    resolve(latest.trim() || null);
  };

  // End the turn after a pause in speech, like a person would.
  const armSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(settle, opts.silenceMs ?? 1400);
  };

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    latest = (finalText + interim).trim();
    opts.onInterim?.(latest);
    armSilence();
  };
  rec.onerror = (e) => {
    if (e.error !== "no-speech" && e.error !== "aborted") opts.onError?.(e.error);
  };
  rec.onend = () => {
    // Chrome ends recognition on its own after a long silence; restart unless the turn is over.
    if (!settled) {
      try {
        rec.start();
      } catch {
        settle();
      }
    }
  };

  try {
    rec.start();
  } catch (err) {
    opts.onError?.(String(err));
    settle();
  }

  return { result, stop: settle };
}

/* ------------------------------------------------------------------ */
/* Earcons (Web Audio, no assets)                                      */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.08) {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = freq;
  o.type = "sine";
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.linearRampToValueAtTime(0, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

/** Soft two-note chime before every whisper, so the user learns "this voice is Second Ear, not the caller". */
export function playWhisperChime() {
  tone(880, 0, 0.18, 0.06);
  tone(1320, 0.12, 0.25, 0.05);
}

/** UK-style double ring. */
export function playRing() {
  for (const off of [0, 0.6]) {
    tone(400, off, 0.4, 0.05);
    tone(450, off, 0.4, 0.05);
  }
}

export function playHangup() {
  tone(480, 0, 0.15, 0.05);
  tone(360, 0.18, 0.3, 0.05);
}

export function unlockAudio() {
  ctx();
}
