// Decision catalog: the questions sent to Jev in every request (spec §4).
export const CATALOG_VERSION = "triage-catalog-2.3";

export const INTENTS = ["Sales", "Complaint", "Inquiry", "Request", "Feedback", "Spam", "Other"] as const;
export const COMPLAINT_CATEGORIES = ["Payment", "Account", "App", "Card", "Fees", "Financing", "Fraud", "Service", "Other", "None"] as const;
export const SALES_CATEGORIES = ["Account Opening", "Deposits", "Payment", "Financing", "Business Banking", "Other", "None"] as const;
export const REQUEST_CATEGORIES = ["Block", "Closure", "Reactivation", "Data Change", "Limit Change", "Document", "Other", "None"] as const;
export const URGENCIES = ["Routine", "Medium", "High", "Critical"] as const;
export const ACTIONS = ["Sales Follow-up", "Complaint Ticket", "Security Escalation", "Request Information", "FAQ", "Admin Follow-up", "Public-to-Private", "Human Review", "No Action"] as const;

export type Intent = (typeof INTENTS)[number];
export type Action = (typeof ACTIONS)[number];

// Shapes of the `questions` map in POST /v1/systemone (https://docs.typesafe.ai/api).
export type QuestionDef =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

const CTX = "Base your answer on `message`. Use `conversation_context` only for background, and `channel`, `message_type` and `customer_type` as metadata.";

// Keys come back unchanged under `answers`.
export const QUESTIONS: Record<string, QuestionDef> = {
  primary_intent: {
    type: "choice",
    instructions: `What is the primary intent of this incoming banking message? ${CTX}`,
    criteria: {
      Sales: "The customer or their business wants to get, open, apply for, use, buy or be onboarded to a bank product or service, or asks who to talk to, whether a product is available or open to them, about a referral, or how to apply, or asks for pricing, a demo or a proposal. Includes business and SME needs such as merchant onboarding, APIs, payroll or financing",
      Complaint: "Something the customer experienced went wrong, is unresolved, delayed, unexplained or unexpected, even if worded as a question or a polite follow-up (e.g. \"why is the fee higher?\", \"still no decision, please check\"). Also fraud, phishing or a lost card that happened to them",
      Inquiry: "A general how-to or information question about how an existing feature, fee, limit or process works, or general safety guidance (e.g. \"what should I do if I lose my phone?\"), with no problem experienced and no interest in getting a product",
      Request: "The customer only orders the bank/admin to perform an action on their account, with no problem described, such as \"please close my account\" or \"please block my account\". A how-to question (\"how do I change my number?\") is Inquiry, and a reported problem is Complaint",
      Feedback: "Praise, thanks, suggestion or general opinion with no request or problem",
      Spam: "Unsolicited promotion, giveaway, gambling, crypto or get-rich scheme, scam link or irrelevant content, even if it sounds like a bank message",
      Other: "No usable content: acknowledgements, holding replies (\"ok noted\", \"I will reply later\", \"never mind\"), fragments or too little to tell",
    },
  },
  sales_opportunity: {
    type: "noul",
    instructions: `Does the message show a sales opportunity, meaning interest in a new banking product or service? Judge independently of whether it is also a complaint. ${CTX}`,
    criteria: { true: "The customer shows interest in opening, applying for or buying a product", false: "No product interest" },
  },
  complaint_indicator: {
    type: "noul",
    instructions: `Is the message a complaint, meaning a reported problem, failure or dissatisfaction? Judge independently of whether it also contains a sales opportunity. ${CTX}`,
    criteria: { true: "The customer reports a problem or expresses dissatisfaction", false: "No problem or dissatisfaction reported" },
  },
  complaint_category: {
    type: "choice",
    instructions: `If the message contains a complaint, which category does it fall under? Answer None if there is no complaint. ${CTX}`,
    criteria: {
      Payment: "Transfers, top-ups, BI-FAST, QRIS, virtual account, autodebit or other payments that failed, are delayed, reversed or were deducted wrongly",
      Account: "Account access, balance, statements or account maintenance, including incoming transfers or matured deposits not credited to the balance",
      App: "Mobile or web app errors, login problems, bugs",
      Card: "Debit or credit card issues, ATM problems, card transactions recorded twice or wrongly, declined card payments, card OTP or 3D Secure problems",
      Fees: "Unexpected, unclear or incorrect fees, charges, penalties, late fees or margin/interest billed higher than scheduled, including on loans",
      Financing: "Loans, credit, financing, installments, early settlement, restructuring, payoff letters, collections, and documents for a financing application",
      Fraud: "Fraud, scam, phishing attempts received, suspicious or unauthorized transactions, misused identity data or account takeover",
      Service: "Poor customer service, canned or slow replies, unanswered tickets, staff behaviour",
      Other: "A complaint that fits none of the categories above, such as unwanted marketing, telemarketing, promotions after opt-out, or misused personal data in marketing",
      None: "The message contains no complaint",
    },
  },
  sales_category: {
    type: "choice",
    instructions: `If the message shows a sales opportunity, which product area is it about? Answer None if there is none. ${CTX}`,
    criteria: {
      "Account Opening": "Opening a personal savings or current account, including salary/payroll accounts for an individual, new-account promos and referrals",
      Deposits: "Time deposits, savings products, placing funds (also for a company) and moving savings from another bank",
      Payment: "Payment products: QRIS acceptance, virtual accounts, payment collection, payout, bulk transfer or payment APIs",
      Financing: "Loans, credit, KTA, mortgages, equipment or working-capital financing",
      "Business Banking": "Business or corporate banking beyond a simple payment product: company accounts, partnerships, merchant onboarding, host-to-host, multi-user approval, payroll for a company, BaaS or embedded finance, SME marketplace banking",
      Other: "A sales interest that fits none of the areas above",
      None: "The message shows no sales opportunity",
    },
  },
  request_category: {
    type: "choice",
    instructions: `If the customer is asking the bank or an admin to perform an action (not just asking a question), what kind of request is it? Answer None if there is no such request. ${CTX}`,
    criteria: {
      Block: "Block, freeze or suspend a card, account, wallet or access (e.g. \"tolong blokir\")",
      Closure: "Close or terminate an account, card, product, subscription or service (e.g. \"tolong tutup rekening\")",
      Reactivation: "Unblock, reactivate or reopen a blocked, dormant or closed account, card or access",
      "Data Change": "Update personal data, phone number, email, address, PIN or password reset",
      "Limit Change": "Raise or lower a transaction, card or credit limit",
      Document: "Send or issue a statement, certificate, receipt or other document",
      Other: "An action request that fits none of the types above",
      None: "The message contains no request for the bank to perform an action",
    },
  },
  // Score criteria are ordered levels; the name before ":" is mapped back to URGENCIES.
  urgency: {
    type: "score",
    instructions: `How urgent is it for the bank to respond to this message? ${CTX}`,
    criteria: [
      "Routine: no time pressure",
      "Medium: customer is inconvenienced and expects a timely answer",
      "High: customer has lost access to money or has a repeated or escalating problem",
      "Critical: active fraud, security risk or serious financial harm happening now",
    ],
  },
  security_concern: {
    type: "noul",
    instructions: `Does the customer report a security incident that happened to them or is happening now: fraud, a phishing message they received, an unauthorized or suspicious transaction, a lost or stolen card or phone, or a possible account takeover? Answer false for general safety or how-to questions (e.g. \"what should I do if I lose my phone?\", \"how do I report suspicious transactions?\"), and false for unsolicited promotions or scams sent to the bank. ${CTX}`,
    criteria: { true: "The customer reports a security incident affecting them", false: "No incident reported, a general question, or spam" },
  },
  next_action: {
    type: "choice",
    instructions: `What is the best next action for the bank? Choose Complaint Ticket whenever the customer describes a problem, even if more details could help. Choose Sales Follow-up whenever the customer shows interest in a product or service. Choose FAQ for general how-to questions. Choose Request Information only when the message is too vague to act on and is not a complaint or sales interest. Choose No Action for spam and for feedback (thanks, praise, feature suggestions) that has nothing to answer, and Human Review for acknowledgements, fragments or anything unclear. ${CTX}`,
    criteria: {
      "Sales Follow-up": "A sales team member should contact the customer about a product",
      "Complaint Ticket": "The customer describes a problem or unresolved issue; open a ticket for the service team",
      "Security Escalation": "Escalate immediately to the security or fraud team",
      "Admin Follow-up": "The customer asks for an action only an admin can perform (block, close, reactivate, change data or limit); route to the responsible admin",
      "Request Information": "The message is too vague to act on and is neither a complaint nor sales interest; ask the customer for details",
      FAQ: "A standard FAQ answer resolves it",
      "Public-to-Private": "The message is public and the conversation should move to a private channel",
      "Human Review": "Unclear, a bare acknowledgement or fragment, or sensitive; a person should look at it",
      "No Action": "No response needed: spam, thanks, praise or a feature suggestion with nothing to answer",
    },
  },
};

export const PUBLIC_MESSAGE_TYPES = ["comment", "review"];

export const REQUIRED_COLUMNS = ["message_id", "channel", "message_text"] as const;
export const OPTIONAL_COLUMNS = ["message_type", "conversation_context", "customer_type", "expected_intent", "expected_category", "expected_action"] as const;
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;
