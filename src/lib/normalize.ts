import type { JevState } from "./jev/types";

const clean = (s: unknown) =>
  String(s ?? "").normalize("NFC").replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export interface RowInput {
  channel: string;
  message_text: string;
  message_type?: string | null;
  customer_type?: string | null;
  conversation_context?: string | null;
}

export function normalizeState(r: RowInput): JevState {
  const state: JevState = { message: clean(r.message_text), channel: clean(r.channel) };
  if (r.message_type) state.message_type = clean(r.message_type).toLowerCase();
  if (r.customer_type) state.customer_type = clean(r.customer_type).toLowerCase();
  if (r.conversation_context) state.conversation_context = clean(r.conversation_context).slice(-2000);
  return state;
}
