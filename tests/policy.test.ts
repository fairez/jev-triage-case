import test from "node:test";
import assert from "node:assert/strict";
import { applyPolicy } from "../src/lib/policy";
import { classMetrics, percentile } from "../src/lib/stats";
import { requestCost } from "../src/lib/config";
import type { JevResponse } from "../src/lib/jev/types";

const resp = (o: { intent?: string; conf?: number; action?: string; sales?: number; complaint?: number; security?: number }): JevResponse => ({
  judgments: {
    primary_intent: { value: o.intent ?? "Inquiry", confidence: o.conf ?? 0.95 },
    sales_opportunity: { probability: o.sales ?? 0 },
    complaint_indicator: { probability: o.complaint ?? 0 },
    complaint_category: { value: "Payment", confidence: 0.9 },
    request_category: { value: "Block", confidence: 0.9 },
    sales_category: { value: "Financing", confidence: 0.9 },
    urgency: { value: "Routine", confidence: 0.9 },
    security_concern: { probability: o.security ?? 0 },
    next_action: { value: o.action ?? "FAQ", confidence: 0.9 },
  },
});

test("security concern overrides Jev action", () => {
  const r = applyPolicy({ response: resp({ action: "FAQ", security: 0.9 }), threshold: 0.8 });
  assert.equal(r.finalAction, "Security Escalation");
});
test("public comment never gets a public reply", () => {
  const r = applyPolicy({ response: resp({ intent: "Sales", action: "Sales Follow-up" }), messageType: "comment", threshold: 0.8 });
  assert.equal(r.finalAction, "Public-to-Private");
});
test("public security post still escalates", () => {
  const r = applyPolicy({ response: resp({ security: 0.8 }), messageType: "comment", threshold: 0.8 });
  assert.equal(r.finalAction, "Security Escalation");
});
test("low confidence goes to human review", () => {
  const r = applyPolicy({ response: resp({ conf: 0.5, action: "FAQ" }), threshold: 0.8 });
  assert.equal(r.finalAction, "Human Review");
});
test("mixed intent: complaint first, sales queued", () => {
  const r = applyPolicy({ response: resp({ intent: "Complaint", sales: 0.8, complaint: 0.9, action: "Sales Follow-up" }), threshold: 0.8 });
  assert.equal(r.finalAction, "Complaint Ticket");
  assert.ok(r.simulated.some((s) => s.type === "Sales Follow-up"));
});
test("unknown action falls back to human review", () => {
  assert.equal(applyPolicy({ response: resp({ action: "Teleport" }), threshold: 0.8 }).finalAction, "Human Review");
});
test("cost formula", () => {
  assert.equal(requestCost(1_000_000, 0, { inputPricePerM: 0.042, outputPricePerM: 0 }), 0.042);
  assert.equal(requestCost(500_000, 1_000_000, { inputPricePerM: 0.042, outputPricePerM: 1 }), 1.021);
});
test("percentiles (nearest rank)", () => {
  const a = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(a, 50), 50);
  assert.equal(percentile(a, 95), 95);
  assert.equal(percentile(a, 99), 99);
  assert.equal(percentile([], 50), null);
});
test("macro-F1", () => {
  const m = classMetrics([
    { expected: "a", actual: "a" }, { expected: "a", actual: "b" }, { expected: "b", actual: "b" }, { expected: "b", actual: "b" },
  ]);
  assert.equal(m.accuracy, 0.75);
  assert.ok(Math.abs(m.macroF1! - (2 / 3 + 0.8) / 2) < 1e-9);
});
test("request intent routes to admin follow-up with request category", () => {
  const r = applyPolicy({ response: resp({ intent: "Request", action: "Admin Follow-up" }), threshold: 0.8 });
  assert.equal(r.finalAction, "Admin Follow-up");
  assert.equal(r.category, "Block");
  assert.ok(r.simulated.some((s) => s.type === "Admin Follow-up"));
});
test("public request moves to private channel", () => {
  const r = applyPolicy({ response: resp({ intent: "Request", action: "Admin Follow-up" }), messageType: "comment", threshold: 0.8 });
  assert.equal(r.finalAction, "Public-to-Private");
});
