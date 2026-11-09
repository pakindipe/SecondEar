# Second Ear: a voice that listens *with you*

**Track:** Security + Real-Time Assistance · **Author:** Philip Akindipe

## What I built

Second Ear is a scam-call co-pilot designed to listen alongside the user and **whisper a warning when a conversation becomes suspicious**. It acts *during* the call, when someone asks for a one-time code, pushes a "safe account" transfer or threatens arrest.

The user can respond hands-free: "Second Ear, is this real?", "hang up" or "tell my daughter". After the call, it provides a plain-English summary, suggested next steps and a message ready to share with a family member or carer.

The prototype simulates calls in the browser using a scripted caller and live or scripted user responses. It combines browser speech recognition and synthesis, a local rule-based detector and an optional LLM engine (Claude or OpenAI). **The default experience runs without API keys.** Real phone-call integration remains future work.

## Who it's for

Older adults and anyone less confident with technology who could benefit from clear guidance during a suspicious call. It also supports families and carers by making it easier to understand what happened and help afterwards.

## The problem

Call screening helps before someone answers, but a convincing scammer can still create pressure once a conversation begins. The caller builds trust, introduces urgency, discourages outside help and then asks for money or sensitive information.

Second Ear focuses on **the moment that pressure turns into a dangerous request**. A short spoken warning gives the user a chance to pause and reconsider without having to look at a screen.

## Why voice

- **Eyes busy:** someone holding a phone to their ear may miss a visual warning.
- **Real time:** the prototype can cut in *while* the user reads out digits after a code request.
- **Calm guidance:** a short instruction such as "Don't share that code" gives the user something concrete to do under pressure.
- **Hands-free support:** the user can ask for help without typing or navigating menus.
- **Where I deliberately didn't use voice:** the summary and family message are text so they can be reviewed, saved and shared after the call.

## Key design choices

- **Talk rarely.** Stay quiet at low risk, give at most one warning per turn and limit repeated hang-up offers. Too many interruptions could make users ignore the assistant.
- **Two engines.** Local rules provide fast, explainable detection. The optional LLM engine is intended to catch paraphrased scams. Risk is the maximum of the two scores, prioritizing detection while leaving false-alarm testing as an important next step.
- **Use context.** Protective phrases such as "We'll never ask for your PIN" aren't counted, and reading digits only triggers a warning after a code request.
- **Easy to try.** The core prototype runs without API keys, so reviewers can test the experience without configuring an external service.
- **Measured honestly.** On 18 labelled calls, rules alone detected **7/11 scams with 0/7 false alarms**. All four misses were paraphrased scams. This identifies a gap for LLM testing, but does not yet establish that the LLM closes it.

## What I'd do with more time

1. **Test with real API keys:** enable the Claude and OpenAI integrations and compare them against the rules-only baseline. I would check whether they catch the four missed scams, introduce false alarms or delay warnings, and measure cost and behaviour during API failures.
2. **Real call audio:** investigate a supported carrier or VoIP integration, such as Twilio media streams, and assess mobile-platform restrictions. Warnings should reach only the user, and assistant commands should not be audible to the caller.
3. **On-device models:** explore a small local classifier and streaming speech recognition to keep more sensitive call data on the device and reduce reliance on external services.
4. **Better evaluation:** test hundreds of varied conversations across scam types, legitimate calls, accents and background noise. Measure precision, recall and the time from a risky statement to a spoken warning.
5. **User research with older adults:** test whisper voice, volume, wording and frequency, and whether contacting a trusted person is more helpful than offering to hang up.
6. **Synthetic-voice detection:** investigate acoustic anti-spoofing signals alongside language analysis for impersonation calls such as "Hi Mum, it's me".
7. **Privacy-preserving feedback:** explore sharing anonymized scam patterns with explicit consent, so lessons from one suspicious call can improve future detection without retaining sensitive conversation details.
