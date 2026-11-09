# AI tools used

I used Claude, ChatGPT and Google Gemini as tools to support my research and development of the live scam-call co-pilot. I directed the project, defined its requirements and made the product decisions, while using AI assistance for research, implementation, testing and debugging.

## Tools

| Tool | Used for |
|---|---|
| **Google Gemini** | Supporting my initial research alongside online documentation and helping me explore the problem space |
| **Claude Code** | Helping plan the implementation, scaffold the project, generate substantial first-draft code, run Playwright browser tests and the evaluation script, and draft documentation |
| **Claude / ChatGPT** | Providing conversational assistance during the planning and development process |
| **Claude or OpenAI API** (optional, at runtime) | Providing the product’s LLM risk analysis through `server/llm.ts`, when configured |

## How I worked with them

1. **Research and problem choice.** I spent about a day researching the problem before starting the build. I reviewed online documentation and used Google Gemini to support my research. I knew I wanted to build something relevant to Hiya’s call-protection work. I then used Claude Code to explore possible approaches and chose the live scam-call co-pilot to provide useful spoken warnings during suspicious calls.

2. **Iterative build.** I used Claude Code to help turn my requirements into an implementation, including `rules.ts`, `assist.ts`, `callEngine.ts`, `speech.ts` and the UI. It generated substantial first-draft code, while I steered the design and behaviour. My requirements included a default mode that works without an API key, combining rules-based and LLM risk scores using `max`, and allowing at most one whisper per turn.

3. **Testing and debugging.** I used Claude Code to run headless-browser tests and the evaluation script to help identify issues and guide fixes. These surfaced:
   - a regex that missed “gift cards.” at the end of a sentence;
   - a false warning when someone read their own phone number, addressed with context-aware digit detection;
   - a React effect issue involving a Promise returned by `scrollIntoView`;
   - a field-name collision (`kind`) between whispers and transcript rows;
   - speech synthesis racing through the call when no voices were installed.

4. **What I verified myself.** I tested the app in Chrome to check the microphone, audio playback and call flow. I tried both suspicious and legitimate call examples to assess whether warnings appeared at appropriate moments. I reviewed the whisper wording to keep it short, clear and useful, and checked that the default mode worked without an API key. I also reviewed the evaluation results to understand which scenarios the rules engine detected and where it still missed signals.

## Decisions I owned

- Selecting the problem, track and target user after researching and exploring possible approaches.
- Prioritizing occasional, useful warnings over constant commentary.
- Making the product runnable without an API key so reviewers could try it easily.
- Combining rules-based and LLM risk scores using the higher score.
- Reporting the rules engine’s misses honestly rather than tuning the rules specifically to the evaluation examples.
