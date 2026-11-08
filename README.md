# Second Ear

**A live scam-call co-pilot that whispers warnings into your ear while the call is still happening.**

Hiya Voice AI Challenge 2026 · Tracks: **Security** + **Real-Time Assistance**

When a "bank fraud team" calls and asks for the code they've "just sent you", the person on the phone has the handset against their ear. A warning on the screen is invisible to them, and a report after the call is too late. Second Ear listens to the call, spots scam tactics as they happen, and says something quietly in the user's ear at the moment it matters:

> *(soft chime)* "Careful. They're asking for a code. Your real bank will never ask for that over the phone. Say 'Second Ear, hang up' and I'll end the call."

The user can answer it hands-free: *"Second Ear, is this real?"* / *"Second Ear, hang up."* / *"Second Ear, tell my daughter."*

---

## Quick start

Requires **Node 20+** and **Chrome or Edge** (for the built-in speech APIs).

```bash
npm install
```

```bash
npm run dev
```

Open **http://localhost:5173**, pick a call, and press **Start incoming call**, then **Answer**.

**No API keys are needed.** Without keys, Second Ear uses its rule-based risk engine and the browser's built-in speech recognition and text-to-speech. To add the LLM risk engine as well:

```bash
cp .env.example .env   # then set ANTHROPIC_API_KEY (or OPENAI_API_KEY)
```

Restart `npm run dev`. The header badge will show `Risk engine: rules + anthropic`.

### Production build (single server)

```bash
npm run build && npm start
```

Serves the app and the API on http://localhost:8787.

### Evaluation

```bash
npm run eval
```

Scores 18 labelled call transcripts (11 scam, 7 genuine) with each engine. It adds the LLM column automatically if a key is set.

---

## Using it

| Mode | What happens |
|---|---|
| **Auto demo** | Both sides of the call are played for you. Best first look; no mic needed. |
| **Live mic** | You play the person who answered. Speak your replies (or type them, or click the suggested line). **Use headphones** so the mic doesn't pick up the caller. |

Scenarios (all organisations are fictional):

1. **"Bank fraud team" wants your code.** Panic, then a one-time-code request, then a "safe account". Watch it cut in when the user starts reading the code out.
2. **"Tax office" threatens arrest.** Threats, secrecy, gift cards.
3. **Genuine bank fraud check.** Same bank, mentions fraud and PINs, but asks for nothing. Second Ear should stay quiet. *(This is the false-alarm test.)*
4. **GP appointment reminder.** Baseline normal call.

Untick **Sound on** to run silently at faster speed (useful for a quick look, or if the browser has no voices).

---

## How it works

```
                 ┌──────────── browser ─────────────────────────────────────────────┐
 scripted caller │ speechSynthesis ──► transcript ◄── SpeechRecognition (your mic)   │
                 │                         │                                         │
                 │                         ▼                                         │
                 │             rules engine (instant, offline)  ──┐                  │
                 │                         │                      ├─► merge (max) ─► whisper policy ─► chime + whisper TTS
                 │                         └─► POST /api/analyze ─┘                  │
                 └─────────────────────────────────│────────────────────────────────┘
                                                   ▼
                                    server: Claude / OpenAI (optional)
```

| File | Role |
|---|---|
| `src/shared/rules.ts` | Regex-based tactic detector + scoring. Every hit carries the exact phrase as evidence. Recognises *protective* phrases ("we will never ask for your PIN") so genuine callers aren't flagged. |
| `server/llm.ts` | LLM engine: structured output (forced tool call / JSON mode) with the same tactic taxonomy. Catches paraphrased scams the rules miss. |
| `src/lib/assist.ts` | Pure decision logic: merging engines, *when* to whisper and *what* to say, voice-command parsing, post-call summary. |
| `src/lib/callEngine.ts` | The call state machine: caller turn → assess → whisper → user turn → assess. Handles real-time cut-in. |
| `src/lib/speech.ts` | Web Speech API wrappers (TTS with fallback timers, continuous STT with silence detection) and Web Audio earcons. |
| `src/shared/scenarios.ts` | Scripted calls. |
| `eval/` | Labelled fixtures and the evaluation script. |

Design decisions and trade-offs are in **[DECISIONS.md](DECISIONS.md)**. The one-page write-up is **[WRITEUP.md](WRITEUP.md)**. AI tool usage is in **[ai.md](ai.md)**.

---

## Known limitations

- **It's a simulated call.** The caller is scripted TTS, not a real phone line. A real product would sit in the phone's call audio path (see WRITEUP "What's next").
- **Speech recognition needs Chrome/Edge.** In Chrome, the Web Speech API sends audio to Google's servers. In Firefox/Safari you can type replies instead.
- **Voice commands are heard by the caller too** in this prototype. A real product would use a side-button press-to-talk or on-device keyword spotting, and mute the uplink while you speak to Second Ear.
- **The rules engine misses paraphrased scams.** That's measured in `npm run eval` and is the reason for the LLM engine.
