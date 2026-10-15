// Decision catalog: the questions sent to Jev in every request (spec §4).
export const CATALOG_VERSION = "triage-catalog-2.1";

export const INTENTS = ["Sales", "Complaint", "Inquiry", "Request", "Feedback", "Spam", "Other"] as const;
export const COMPLAINT_CATEGORIES = ["Payment", "Account", "App", "Card", "Fees", "Lending", "Fraud", "Service", "Other", "None"] as const;
export const SALES_CATEGORIES = ["Account Opening", "Deposits", "Payments", "Financing", "Business Banking", "Other", "None"] as const;
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
      Sales: "The customer wants to open, buy, apply for or learn about a banking product",
      Complaint: "The customer reports a problem, failure, unfair charge or dissatisfaction",
      Inquiry: "The customer asks a question or requests information or help",
      Request: "The customer asks the bank/admin to perform an action on their account or product, such as block, close, reactivate or change something",
      Feedback: "Praise, suggestion or general opinion with no request or problem",
      Spam: "Unsolicited promotion, scam link or irrelevant content",
      Other: "None of the above, or too little content to tell",
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
      Payment: "Transfers, top-ups, QRIS or other payments that failed, are delayed or were deducted wrongly",
      Account: "Account access, balance, statements or account maintenance",
      App: "Mobile or web app errors, login problems, bugs",
      Card: "Debit or credit card issues, ATM problems",
      Fees: "Unexpected, unclear or incorrect fees and charges",
      Lending: "Loans, credit, installments, collections",
      Fraud: "Fraud, scam, phishing, unauthorized transactions or account takeover",
      Service: "Poor customer service, slow responses, staff behaviour",
      Other: "A complaint that fits none of the categories above",
      None: "The message contains no complaint",
    },
  },
  sales_category: {
    type: "choice",
    instructions: `If the message shows a sales opportunity, which product area is it about? Answer None if there is none. ${CTX}`,
    criteria: {
      "Account Opening": "Opening a savings or current account",
      Deposits: "Time deposits and savings products",
      Payments: "Payment, wallet, QRIS or transfer products",
      Financing: "Loans, credit, KTA, mortgages",
      "Business Banking": "Business or SME accounts and services",
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
    instructions: `Does the message indicate a security concern, such as fraud, phishing, an unauthorized transaction, a lost or stolen card, or a possible account takeover? ${CTX}`,
    criteria: { true: "A security risk to the customer or the bank is described", false: "No security risk described" },
  },
  next_action: {
    type: "choice",
    instructions: `What is the best next action for the bank? ${CTX}`,
    criteria: {
      "Sales Follow-up": "A sales team member should contact the customer about a product",
      "Complaint Ticket": "Open a complaint ticket for the service team",
      "Security Escalation": "Escalate immediately to the security or fraud team",
      "Admin Follow-up": "The customer asks for an action only an admin can perform (block, close, reactivate, change data or limit); route to the responsible admin",
      "Request Information": "More details are needed from the customer before acting",
      FAQ: "A standard FAQ answer resolves it",
      "Public-to-Private": "The message is public and the conversation should move to a private channel",
      "Human Review": "Ambiguous or sensitive; a person should look at it",
      "No Action": "No response needed (spam, thanks, noise)",
    },
  },
};

export const PUBLIC_MESSAGE_TYPES = ["comment", "review"];

export const REQUIRED_COLUMNS = ["message_id", "channel", "message_text"] as const;
export const OPTIONAL_COLUMNS = ["message_type", "conversation_context", "customer_type", "expected_intent", "expected_category", "expected_action"] as const;
export const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;
