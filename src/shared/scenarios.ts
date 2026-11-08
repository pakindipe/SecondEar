/**
 * Scripted calls. The caller side is fixed so the demo is repeatable without a second person.
 * `reply` is what the user says in Auto mode, and the suggested line in Live (mic) mode.
 * All organisations are fictional.
 */
export interface Turn {
  caller: string;
  reply: string;
}

export interface Scenario {
  id: string;
  title: string;
  callerId: string;
  number: string;
  isScam: boolean;
  blurb: string;
  turns: Turn[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "bank-otp",
    title: "“Bank fraud team” wants your code",
    callerId: "Northgate Bank",
    number: "+44 20 7946 0123",
    isScam: true,
    blurb: "Spoofed bank number. Builds panic, then asks for the one-time code. The most common UK scam call.",
    turns: [
      {
        caller: "Hello, is that Margaret? This is David calling from the Northgate Bank fraud department.",
        reply: "Yes, this is Margaret. What's happened?",
      },
      {
        caller: "We've detected suspicious payments on your account, and I'm afraid your savings are being drained right now. We need to act immediately.",
        reply: "Oh no. What do I need to do?",
      },
      {
        caller: "I'm sending you a six digit verification code now. Please read me the code so I can freeze the account.",
        reply: "Okay, it says four eight two nine one seven.",
      },
      {
        caller: "Thank you. Now, to protect your money, we need to move your savings into a safe account. Please don't hang up, and don't tell anyone at the branch, as staff may be involved.",
        reply: "Second Ear, is this real?",
      },
      {
        caller: "Margaret? Are you still there? We need to do this in the next few minutes.",
        reply: "Second Ear, hang up.",
      },
    ],
  },
  {
    id: "tax-threat",
    title: "“Tax office” threatens arrest",
    callerId: "Unknown",
    number: "+44 161 496 0777",
    isScam: true,
    blurb: "Threats and isolation, then payment by gift cards. Aimed at older people and recent migrants.",
    turns: [
      {
        caller: "This is Officer Grant calling from the tax office. There is a warrant for your arrest over unpaid tax.",
        reply: "A warrant? I don't understand, I always pay my tax.",
      },
      {
        caller: "To stop the police coming today, you must pay the fine now. You can pay with Google Play gift cards from any supermarket.",
        reply: "Gift cards? Can I talk to my son first?",
      },
      {
        caller: "No. Do not tell your family about this, it is a confidential case. Stay on the line while you go to the shop.",
        reply: "Second Ear, hang up.",
      },
    ],
  },
  {
    id: "real-bank",
    title: "Genuine bank fraud check",
    callerId: "Northgate Bank",
    number: "+44 20 7946 0123",
    isScam: false,
    blurb: "A real fraud check. It sounds similar to a scam (same bank, mentions fraud and PIN) but asks for nothing. Second Ear should stay quiet.",
    turns: [
      {
        caller: "Hello, this is Priya from the Northgate Bank fraud team. I'm calling about a card payment we've paused.",
        reply: "Oh, okay. Which payment?",
      },
      {
        caller: "It's forty two pounds at an electronics shop in Leeds, earlier this afternoon. Was that you?",
        reply: "No, that wasn't me.",
      },
      {
        caller: "No problem, we've blocked it and we'll send you a new card. Just so you know, we will never ask for your PIN or a code over the phone.",
        reply: "Thank you, that's reassuring.",
      },
      {
        caller: "If you'd like to check this call is genuine, hang up and call the number on the back of your card. Have a good evening.",
        reply: "Thanks, bye.",
      },
    ],
  },
  {
    id: "gp-reminder",
    title: "GP appointment reminder",
    callerId: "Riverside Surgery",
    number: "+44 113 496 0555",
    isScam: false,
    blurb: "An everyday call. A baseline for false alarms.",
    turns: [
      {
        caller: "Hi, it's Sam from Riverside Surgery. I'm just calling to remind you about your appointment with Doctor Okafor tomorrow at ten.",
        reply: "Oh yes, thank you.",
      },
      {
        caller: "Could you bring a list of your current medication? And please arrive five minutes early.",
        reply: "Will do.",
      },
      {
        caller: "Lovely, see you tomorrow.",
        reply: "Bye now.",
      },
    ],
  },
];
