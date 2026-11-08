# Second Ear: a voice that listens with you

**Track:** Security + Real-Time Assistance · **Author:** Philip Akindipe

## What I built

Second Ear is a co-pilot that sits on a phone call, listens to the caller, and **whispers into the user's ear** when the call turns into a scam. It doesn't block calls before they ring. It acts *during* the conversation, at the moment a caller asks for a one-time code, pushes a "safe account" transfer or threatens arrest. The user can talk back hands-free: "Second Ear, is this real?", "hang up", "tell my daughter". When the call ends, it gives the user a plain-English summary with next steps, plus a message ready to send to a family member or carer.

The prototype simulates the call in the browser (scripted caller, live or scripted user). It uses the browser's built-in speech recognition and synthesis, an offline rule-based tactic detector, and an optional LLM engine (Claude or OpenAI). It runs with **no API keys**.

## Who it's for

Older adults and anyone less confident with technology: the people most targeted by impersonation fraud, and the least likely to notice a warning on the screen mid-call. Also their families, who usually find out afterwards.

## The problem

Caller ID stops many scam calls, but spoofed numbers that show up as "your bank" still get through. Once the call is answered, the scam works through **social pressure in real time**: authority, panic, isolation, then the ask. Today's warnings come at the wrong time (before the call or after the money is gone) and through the wrong channel (a screen the user isn't looking at).

## Why voice

- **Eyes busy:** the phone is at the ear, so a pop-up is invisible.
- **Real time:** the dangerous moment lasts seconds. Second Ear even cuts in *while* the user is reading out a code.
- **Emotion:** scammers use tone and urgency. A calm voice in the same channel is the most direct counter.
- **Accessibility:** no app to open, no menu to learn. Speech is the interface everyone already has.
- **Where I deliberately didn't use voice:** the summary and the family message are text, because once the call is over the user can look at the screen, and the content needs to persist and be shared.

## Key design choices

- **Talk rarely.** Silence while risk is low, at most one warning per turn, one hang-up offer. Over-warning causes alarm fatigue.
- **Two engines.** Instant, explainable rules run offline. An LLM catches paraphrased scams. Risk is the max of the two, because a miss costs more than an extra whisper.
- **Avoid false alarms.** Protective phrases ("we'll never ask for your PIN") aren't counted, and digit-reading only counts as a risk after a code was requested. A genuine bank fraud call stays at 10/100.
- **Measured.** On 18 labelled calls, rules alone catch **7/11 scams with 0/7 false alarms**. All four misses are paraphrased scams, which is the gap the LLM is there to close.

## What I'd do next

1. **Real call audio:** an Android `InCallService` or a carrier/VoIP integration (e.g. Twilio media streams), with the whisper mixed into the downlink only and the uplink muted during commands.
2. **On-device models:** a small local classifier plus streaming ASR, so call audio never leaves the phone. This matters for privacy and for trust.
3. **Synthetic-voice detection:** flag cloned voices ("Hi Mum, it's me…") using acoustic anti-spoofing features alongside the language signals.
4. **Better eval:** a few hundred real-world-style scripts across scam types and accents, precision/recall per tactic, and latency measured end to end.
5. **User research with older adults:** whisper voice, volume, wording and frequency, and whether a "call my daughter" bridge is more useful than a hang-up.
6. **Network effect:** share anonymised tactic patterns and number reputation back into call-blocking, so a scam caught mid-call helps block the next one before it rings.
