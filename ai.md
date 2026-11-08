# AI tools used

> **TODO (Philip):** edit this file in your own words before submitting. It should describe what *you* did, decided and checked.

## Tools

| Tool | Used for |
|---|---|
| **Claude Code** (agentic coding assistant, cloud session) | Planning the build, scaffolding the project, writing most of the first-draft code, running end-to-end browser tests (Playwright) and the eval, drafting docs |
| **Claude / ChatGPT (chat)** | *TODO: e.g. brainstorming scam typologies, reviewing the write-up, if used* |
| **Claude or OpenAI API** (optional, at runtime) | The LLM risk engine inside the product (`server/llm.ts`) |

## How I worked with them

1. **Problem and track choice.** I asked Claude Code for a plan. It proposed several directions, and I chose the live scam-call co-pilot because it sits next to Hiya's call-protection work, and because the case for voice is strongest when the phone is at your ear.
2. **Iterative build.** Claude Code wrote the modules (`rules.ts`, `assist.ts`, `callEngine.ts`, `speech.ts`, UI). I steered the design: no-API-key mode as the default so reviewers can run it, rules + LLM merged with `max`, at most one whisper per turn.
3. **Testing caught real bugs.** Headless-browser runs and the eval script surfaced:
   - a regex that missed "gift cards." at the end of a sentence;
   - a false-alarm risk where reading your own phone number triggered "don't read out that code" (fixed with context-aware digit detection);
   - a React crash from newer Chromium returning a Promise from `scrollIntoView` inside an effect;
   - a field-name collision (`kind`) between whispers and transcript rows;
   - speech synthesis racing through the call when no voices are installed.
4. **What I verified myself.** *TODO: e.g. ran it in Chrome with sound and mic, tuned the whisper wording, re-read every module so I can explain it, checked the eval numbers.*

## What AI did *not* decide

- The problem, the track and the target user.
- The whisper policy trade-off: prefer rare, high-value interruptions over constant commentary.
- Reporting the rules engine's misses honestly in the eval, instead of tuning the regexes to the test set.
