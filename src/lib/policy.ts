// Deterministic routing applied after Jev returns (spec §4, §7.9).
import { ACTIONS, PUBLIC_MESSAGE_TYPES } from "./catalog";
import type { JevResponse } from "./jev/types";

export interface PolicyInput {
  response: JevResponse;
  messageType?: string | null;
  threshold: number;
}

export interface PolicyOutput {
  intent: string;
  category: string;
  confidence: number | null;
  urgency: string;
  jevAction: string;
  finalAction: string;
  notes: string[];
  simulated: { type: string; detail: string }[];
}

const PRIVATE_ONLY = new Set(["Sales Follow-up", "Complaint Ticket", "Request Information", "FAQ"]);
const SECURITY_THRESHOLD = 0.5;
const MIXED_THRESHOLD = 0.5;

export function applyPolicy({ response, messageType, threshold }: PolicyInput): PolicyOutput {
  const j = response.judgments;
  const intent = j.primary_intent?.value ?? "Other";
  const confidence = j.primary_intent?.confidence ?? null;
  const urgency = j.urgency?.value ?? "Routine";
  const jevAction = j.next_action?.value ?? "Human Review";
  const complaintP = j.complaint_indicator?.probability ?? 0;
  const salesP = j.sales_opportunity?.probability ?? 0;
  const securityP = j.security_concern?.probability ?? 0;
  const category =
    intent === "Sales" ? (j.sales_category?.value ?? "None")
    : intent === "Complaint" ? (j.complaint_category?.value ?? "None")
    : complaintP >= MIXED_THRESHOLD && (j.complaint_category?.value ?? "None") !== "None" ? j.complaint_category!.value!
    : (j.sales_category?.value ?? "None");

  const notes: string[] = [];
  const simulated: { type: string; detail: string }[] = [];
  let action: string = (ACTIONS as readonly string[]).includes(jevAction) ? jevAction : "Human Review";
  if (action !== jevAction) notes.push(`Unknown Jev action "${jevAction}" -> Human Review`);

  const isPublic = PUBLIC_MESSAGE_TYPES.includes((messageType ?? "").toLowerCase());
  const mixed = salesP >= MIXED_THRESHOLD && complaintP >= MIXED_THRESHOLD;

  if (securityP >= SECURITY_THRESHOLD) {
    action = "Security Escalation";
    notes.push(`Security concern ${securityP.toFixed(2)} >= ${SECURITY_THRESHOLD}: escalate`);
  } else if (intent === "Spam" && action !== "Human Review") {
    action = "No Action";
    notes.push("Spam: no action");
  } else if (confidence !== null && confidence < threshold) {
    action = "Human Review";
    notes.push(`Intent confidence ${confidence.toFixed(2)} < threshold ${threshold}: human review`);
  } else if (mixed && action !== "Human Review") {
    action = "Complaint Ticket";
    notes.push("Mixed intent: complaint handled first, sales follow-up queued");
    simulated.push({ type: "Sales Follow-up", detail: "Queued behind complaint ticket (simulated)" });
  }

  if (isPublic && PRIVATE_ONLY.has(action)) {
    notes.push(`Public ${messageType}: no public reply, move to private channel`);
    action = "Public-to-Private";
  }
  if (isPublic && action === "Security Escalation") notes.push("Public post: handle privately, never reply with account details");

  const detail: Record<string, string> = {
    "Security Escalation": "Security team alert created (simulated)",
    "Complaint Ticket": "Complaint ticket created (simulated)",
    "Sales Follow-up": "CRM lead routed to sales (simulated)",
    "Public-to-Private": "Invitation to continue via DM drafted, not sent (simulated)",
    "Human Review": "Added to human review queue (simulated)",
    "Request Information": "Information request drafted, not sent (simulated)",
    FAQ: "FAQ answer drafted, not sent (simulated)",
  };
  if (detail[action]) simulated.unshift({ type: action, detail: detail[action] });

  return { intent, category, confidence, urgency, jevAction, finalAction: action, notes, simulated };
}
