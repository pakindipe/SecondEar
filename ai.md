# AI tools used

I used Claude, ChatGPT and Google Gemini to support my research and development of Second Ear. I selected the project direction, reviewed proposed designs and refined the experience through my own testing. Claude Code generated substantial first-draft code and helped with implementation, automated testing and debugging.

## Tools

| Tool | Used for |
|---|---|
| **Google Gemini** | Supporting initial research alongside online documentation and exploring the problem space |
| **Claude Code** | Proposing implementation plans, scaffolding the project, generating first-draft code, running Playwright browser tests and the evaluation script, and drafting documentation |
| **Claude / ChatGPT (chat)** | Providing conversational assistance during planning and development |
| **Claude or OpenAI API** (optional, at runtime) | Providing the product's LLM risk analysis through `server/llm.ts`, when configured |

## How I worked with them

1. **Research and problem choice.** I spent about a day researching before starting the build. I reviewed online documentation and used Google Gemini to support that research. I wanted to build something relevant to Hiya's call-protection work. After exploring possible approaches with Claude Code, I selected a live scam-call co-pilot that could provide spoken guidance during a suspicious conversation.

2. **Iterative build.** Claude Code generated initial implementations of the rules engine, call handling, speech functionality and UI. I reviewed and agreed with design choices such as a default mode without API keys, combining rules-based and LLM risk scores using `max`, and allowing at most one whisper per turn. These choices made the prototype easier to try, prioritized potential risks detected by either engine and limited unnecessary interruptions.

3. **Automated testing and debugging.** I used Claude Code to run browser tests and the evaluation script. These helped identify issues and guide fixes, including:
   - a regex that missed "gift cards." at the end of a sentence;
   - a false warning when someone read their own phone number, addressed with context-aware digit detection;
   - a React effect issue involving `scrollIntoView`;
   - a field-name collision (`kind`) between whispers and transcript rows;
   - speech synthesis racing through the call when no voices were installed.

4. **What I changed after testing it myself.** I pushed back on the first UI and asked for a redesign. I requested an iOS-style call screen to make the experience more familiar. While testing in Safari, I found that the phone screen overflowed its frame, a layout bug the automated Chromium tests had missed, and implemented the correction myself. I also had the developer checkbox removed from the user-facing page because it added implementation detail that users did not need.

## Decisions and contributions I owned

- Selecting the problem, track and intended user after researching possible approaches.
- Rejecting the initial UI and requesting a more deliberate design.
- Requesting an iOS-style call screen.
- Testing in Safari and identifying a layout issue missed by automated tests.
- Removing a developer control from the user-facing experience.

## AI-proposed choices I reviewed and accepted

- Running the core experience without API keys.
- Combining rules-based and LLM risk scores using the higher score.
- Prioritizing occasional, useful warnings over constant commentary.
- Reporting the rules engine's misses rather than tuning the rules specifically to the evaluation examples.

AI helped me move from an idea to a working prototype. My contribution included choosing the direction, evaluating suggestions, challenging the initial design and identifying improvements through hands-on testing.
