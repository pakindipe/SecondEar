# Design decisions

The choices behind Second Ear and the trade-offs. Written to be defensible in a code review.

## 1. Problem choice: *during* the call, not before it rings

Caller-ID and spam-blocking (Hiya's core product) work **before** the phone is answered. The calls that get through are the dangerous ones: spoofed numbers that look like the user's real bank. Authorised push-payment and impersonation fraud happens **in the conversation**, so that's where Second Ear acts.

## 2. Why voice is the right interface (and where it isn't)

| Moment | Why voice | Why not a screen/keyboard |
|---|---|---|
| Caller asks for the code | Phone is at the ear; seconds matter | User can't see a notification mid-call |
| User starts reading digits out | Needs an interruption, in real time | Too late by the time a user looks down |
| "Is this real?" | Hands-free, eyes-free, no app to open | Taking the phone from your ear means the scammer hears silence and pushes harder |
| Panic / urgency | A calm voice counters emotional pressure in the same channel | Text doesn't calm anyone down |

**Where voice is *not* used:** the post-call summary and family message are on screen and in text. After the call, the user's eyes are free and the content needs to persist and be forwarded.

## 3. Whisper policy: talk rarely

Talking over a phone call is itself a cost. Too many whispers and the user tunes them out (alarm fatigue), or misses what the caller said. So:

- **Nothing is whispered while risk is "safe" (< 40).** A real bank mentioning fraud gets silence.
- **At most one warning per turn**, about the highest-priority *new* tactic. Once warned, all currently present tactics are marked as warned, so no drip-feed.
- **The hang-up offer is made once**, the first time risk crosses 70.
- **Whispers wait for a turn boundary** (after the caller finishes a line). The exception is the disclosure cut-in, where interrupting is the point.
- **A soft chime precedes every whisper**, so the user learns to tell Second Ear's voice from the caller's.

## 4. Two engines: rules + LLM, merged with `max`

| | Rules (`src/shared/rules.ts`) | LLM (`server/llm.ts`) |
|---|---|---|
| Latency | < 1 ms | ~0.5–2 s |
| Needs network / key | No | Yes |
| Explainable | Exact phrase per hit | Quote + rationale |
| Paraphrase ("pop those numbers back to me") | Misses | Catches |

- **Effective risk = max(rules, LLM).** For fraud prevention a missed scam costs far more than an unnecessary whisper. Rules keep the LLM honest on the obvious cases, and the LLM covers the long tail.
- **Rules run in the browser**, so the first whisper doesn't wait on a network round-trip.
- **The LLM gets a short window (2.5 s) before the user's turn**, so its whisper can land at the right moment. Late results apply at the next turn boundary. Stale responses are dropped by sequence number.
- **Structured output:** a forced tool call (Anthropic) or JSON mode (OpenAI), with the same tactic enum as the rules, so both engines share one vocabulary and UI.

## 5. False-positive handling

- **Protective phrases.** "We will **never ask** for your PIN" contains "PIN". Sentences that match protective patterns don't count credential, payment or remote-access hits, and a call with safety advice and no high-severity ask is capped at 15.
- **Context-aware digit detection.** Reading out 3 digits in a row counts as disclosure **only after a caller has asked for a code**. Otherwise it takes 4+, and it still won't whisper unless overall risk is elevated. So reading your phone number to a friend is fine (see `legit-user-phone-number` in the eval).
- **Digit *runs*, not digit counts:** "Oh, no one told me" contains three number words but no run.

## 6. Simulated call instead of real telephony

A browser can't sit in a real phone call's audio path. The options were:

1. Twilio media streams: real calls, but reviewers would need a Twilio account, a phone number and a public URL. That fails "it has to run".
2. **Scripted caller over TTS (chosen):** fully repeatable, zero setup, and it still exercises every real-time decision. Live mode keeps the *user's* side genuinely live (mic + STT).

The engine is transport-agnostic: `CallEngine` only needs "caller said X" and "user said Y" events, so a Twilio stream could replace the scripted caller later.

## 7. Web Speech API instead of a cloud STT/TTS provider

- No keys, no cost, works offline for TTS. Reviewers can run it.
- Trade-offs: Chrome/Edge only for STT (and Chrome sends the audio to Google); voice quality varies by OS. Every utterance has a duration-based fallback timer, because `speechSynthesis` sometimes never fires `onend`, and if synthesis fails entirely the call continues silently at a natural pace.

## 8. Wake phrase: "Second Ear, …"

- Needed to separate commands to the assistant from conversation with the caller.
- The regex tolerates common mis-hearings ("second year", "2nd ear").
- Known limitation: in this prototype the caller would hear the command. In a real product it would be a side-button hold, or on-device keyword spotting with the uplink muted.

## 9. Architecture

- `assist.ts` is **pure** (no browser APIs): whisper policy, command parsing, merging and summary can all be tested without a browser. `eval/` uses the same code paths as the app.
- `CallEngine` is framework-agnostic; React subscribes through `useSyncExternalStore`.
- No SDKs for the LLM calls (plain `fetch`), to keep dependencies small and the request shape visible.

## 10. Evaluation

`npm run eval` runs 18 labelled calls. Rules only: **7/11 scams caught at the whisper threshold, 0/7 false alarms.** All four misses are paraphrased scams written to avoid keywords. That gap is the case for the LLM engine, and I deliberately didn't tune the rules to the test set to hide it.
