/**
 * Labelled call transcripts for measuring the risk engines.
 * Written to cover common UK scam scripts (per Action Fraud / UK Finance typologies) and
 * genuine calls that share vocabulary with them (banks, deliveries, GPs).
 * Some scam calls are deliberately paraphrased to avoid the obvious keywords; the rules engine
 * is expected to miss some of those, which is the case for the LLM engine.
 */
export interface Fixture {
  id: string;
  isScam: boolean;
  note: string;
  lines: [("caller" | "user"), string][];
}

export const FIXTURES: Fixture[] = [
  // ---------------- scams ----------------
  {
    id: "scam-bank-otp",
    isScam: true,
    note: "Classic bank impersonation + one-time code",
    lines: [
      ["caller", "Hi, I'm calling from your bank's fraud department. There are payments leaving your account right now."],
      ["user", "Oh dear."],
      ["caller", "I've just sent a verification code to your phone. Can you read it out to me?"],
    ],
  },
  {
    id: "scam-safe-account",
    isScam: true,
    note: "Safe-account transfer with insider-staff story",
    lines: [
      ["caller", "This is Mark from the security team at your bank. Your account has been compromised."],
      ["caller", "We need you to transfer your savings to a safe account we've set up in your name. Don't speak to the branch, staff may be involved."],
    ],
  },
  {
    id: "scam-hmrc-giftcards",
    isScam: true,
    note: "Tax threat + gift card payment",
    lines: [
      ["caller", "This is the tax office. A warrant has been issued for your arrest due to unpaid tax."],
      ["caller", "To settle it today you must pay with gift cards. Do not tell your family."],
    ],
  },
  {
    id: "scam-tech-support",
    isScam: true,
    note: "Remote access tech support",
    lines: [
      ["caller", "Hello, I'm calling from Microsoft. Your computer is sending us error messages and has a virus."],
      ["caller", "Please download an app called AnyDesk so I can fix it for you."],
    ],
  },
  {
    id: "scam-police-courier",
    isScam: true,
    note: "Courier fraud: fake police collect cash/cards",
    lines: [
      ["caller", "This is Detective Sergeant Hughes. We've arrested someone using your card."],
      ["caller", "We need your PIN to verify the card, and a courier will collect it from your house. Keep this confidential."],
    ],
  },
  {
    id: "scam-crypto-investment",
    isScam: true,
    note: "Investment scam pushing crypto",
    lines: [
      ["caller", "I'm a broker and we've got an opportunity that's closing within the next hour."],
      ["caller", "You just send the funds in bitcoin to our wallet and we'll triple it by Friday."],
    ],
  },
  {
    id: "scam-user-reads-code",
    isScam: true,
    note: "User starts to disclose a code",
    lines: [
      ["caller", "Just confirm the code on your screen for me please."],
      ["user", "It's seven two nine four one five."],
    ],
  },
  {
    id: "scam-paraphrase-otp",
    isScam: true,
    note: "PARAPHRASED: asks for the text message digits without saying 'code'",
    lines: [
      ["caller", "Hi there, it's the card services team. We've seen something odd on your account."],
      ["caller", "You'll get a text in a moment with some numbers in it. Just pop those back to me so I can stop the payment."],
    ],
  },
  {
    id: "scam-paraphrase-transfer",
    isScam: true,
    note: "PARAPHRASED: asks to 'shift the balance over' to a new sort code",
    lines: [
      ["caller", "Your current account isn't protected any more, so we're opening a fresh one for you."],
      ["caller", "Log in to your app and shift everything over to sort code 20 45 77, I'll stay with you while you do it."],
    ],
  },
  {
    id: "scam-paraphrase-amazon",
    isScam: true,
    note: "PARAPHRASED: Amazon refund scam asking for card digits",
    lines: [
      ["caller", "Hi, this is Amazon Prime billing. You've been charged seventy nine ninety nine for a renewal."],
      ["caller", "To cancel and get your refund, I'll just need the numbers across the front of your card and the expiry."],
    ],
  },
  {
    id: "scam-family-emergency",
    isScam: true,
    note: "PARAPHRASED: 'Hi Mum' voice-clone style emergency",
    lines: [
      ["caller", "Mum, it's me, I've lost my phone and I'm using a friend's. I'm in a bit of trouble."],
      ["caller", "I need you to send eight hundred pounds to this account tonight, please don't tell Dad, I'll explain later."],
    ],
  },
  // ---------------- genuine ----------------
  {
    id: "legit-bank-fraud-check",
    isScam: false,
    note: "Real bank fraud check, mentions PIN and code in safety advice",
    lines: [
      ["caller", "Hello, this is Priya from the Northgate Bank fraud team about a paused card payment."],
      ["caller", "Was the forty two pounds in Leeds you? We will never ask for your PIN or a code over the phone."],
      ["caller", "If you're unsure, hang up and call the number on the back of your card."],
    ],
  },
  {
    id: "legit-gp",
    isScam: false,
    note: "GP reminder",
    lines: [
      ["caller", "Hi, it's Riverside Surgery reminding you of your appointment tomorrow at ten."],
      ["caller", "Please bring a list of your medication."],
    ],
  },
  {
    id: "legit-delivery",
    isScam: false,
    note: "Courier delivery (shares 'courier' vocabulary)",
    lines: [
      ["caller", "Hi, I'm the delivery driver with your parcel, I'm outside but there's no answer."],
      ["caller", "Shall I leave it with your neighbour at number twelve?"],
    ],
  },
  {
    id: "legit-energy",
    isScam: false,
    note: "Energy supplier meter reading",
    lines: [
      ["caller", "Hello, it's Brightwater Energy. We're due to take a meter reading next week."],
      ["caller", "Is Tuesday morning okay? The engineer will carry ID."],
    ],
  },
  {
    id: "legit-friend-urgent",
    isScam: false,
    note: "Friend with genuine urgency (shares 'right now')",
    lines: [
      ["caller", "Hey, are you free right now? The match has started, come over!"],
      ["user", "On my way."],
    ],
  },
  {
    id: "legit-pharmacy",
    isScam: false,
    note: "Pharmacy asking to confirm date of birth (identity check, legit)",
    lines: [
      ["caller", "Hi, it's Hillside Pharmacy about your prescription. It's ready to collect."],
      ["caller", "Can I just confirm your date of birth before I go on?"],
    ],
  },
  {
    id: "legit-user-phone-number",
    isScam: false,
    note: "User reads out their own phone number to a friend",
    lines: [
      ["caller", "What's your new mobile number?"],
      ["user", "It's oh seven seven double four, nine one two, three four five."],
    ],
  },
];
