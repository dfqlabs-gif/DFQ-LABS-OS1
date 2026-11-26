import assert from "node:assert/strict";
import test from "node:test";
import type { Lead } from "../types";
import {
  ageDays, buildOutreachChronology, chooseOutboundMessageType, ensureProspectGreeting, formatProspectGreeting,
  hasSameDayContactIdentity, isSameLagosDay, latestOutboundTouch, normalizeCompanyIdentity,
} from "./outreachPolicy";

const base = {
  id: "lead-1", name: "", company: "Team Novo Developers", phone: "07000000000",
  source: "Instagram", clientType: "Real Estate Developer", service: "", status: "DM Sent",
  priority: "Normal", assignedTo: "Team", notes: "", dmText: "", prospectInitialResponse: "",
  prospectLatestResponse: "", conversationLog: [], nextAction: "", nextActionDate: "",
  dateAdded: "2026-08-01", lastContacted: "2026-08-01", lastMeaningfulTouchpoint: "2026-08-01",
  awaitingReplySince: "", meetingScheduledAt: "", meetingPrepNote: "", followUpCount: 0,
  weekAdded: "", completedFollowUps: [], betaCandidate: false, autoFollowUpDate: null, autoFollowUpReason: "",
} as Lead;

test("same company aliases normalize to one identity", () => {
  assert.equal(normalizeCompanyIdentity("Team Novo Developers"), normalizeCompanyIdentity("Novo"));
  assert.equal(normalizeCompanyIdentity("Team Nova Company"), normalizeCompanyIdentity("Nova"));
});

test("a lead with a confirmed sent message today cannot be treated as a first touch", () => {
  const now = new Date("2026-11-26T13:00:00+01:00");
  const lead = { ...base, outboundMessages: [{ id: "o1", leadId: base.id, userId: "founder", messageType: "INTRODUCTION_DM", messageText: "Hello", source: "test", status: "SENT", generatedAt: "2026-11-26T10:00:00Z", sentAt: "2026-11-26T10:00:00Z" }] } as any;
  assert.equal(latestOutboundTouch(lead)?.id, "o1");
  assert.equal(isSameLagosDay("2026-11-26T10:00:00Z", now), true);
  assert.equal(chooseOutboundMessageType(lead, "INTRODUCTION_DM", now), "FOLLOW_UP");
});

test("a three-month-old outbound is classified as reactivation and chronology states the real gap", () => {
  const now = new Date("2026-11-26T13:00:00+01:00");
  const lead = { ...base, conversationLog: [{ ts: "2026-08-20T10:00:00Z", type: "dm", direction: "outbound", label: "DM sent", text: "Earlier introduction", by: "DFQLABS" }] } as Lead;
  assert.equal(chooseOutboundMessageType(lead, "FOLLOW_UP", now), "REACTIVATION_DM");
  assert.match(buildOutreachChronology(lead, now), /98 days ago/);
  assert.match(buildOutreachChronology(lead, now), /time has passed/);
});

test("prospect greeting is respectful, personalized and Lagos-time aware", () => {
  assert.equal(formatProspectGreeting({ name: "", company: "Abode" }, new Date("2026-11-26T13:00:00+01:00")), "Good afternoon, Team Abode.");
  assert.equal(formatProspectGreeting({ name: "Ifeanyi", company: "Abode" }, new Date("2026-11-26T09:00:00+01:00")), "Good morning, Ifeanyi.");
  assert.equal(formatProspectGreeting({ name: "", company: "Abode" }, new Date("2026-11-26T18:00:00+01:00")), "Good evening, Team Abode.");
});

test("greeting enforcement corrects missing addressees and duplicate company openings", () => {
  const now = new Date("2026-11-26T13:00:00+01:00");
  assert.equal(ensureProspectGreeting({ name: "", company: "Abode" }, "Abode, here is the breakdown I mentioned.", now), "Good afternoon, Team Abode. here is the breakdown I mentioned.");
  assert.equal(ensureProspectGreeting({ name: "", company: "Abode" }, "Hi, I noticed an opportunity in your content.", now), "Good afternoon, Team Abode. I noticed an opportunity in your content.");
  assert.equal(ensureProspectGreeting({ name: "Ifeanyi", company: "Abode" }, "Good morning, Ifeanyi. I have completed the review.", now), "Good afternoon, Ifeanyi. I have completed the review.");
});

test("same-day duplicate protection catches company aliases and shared phone numbers", () => {
  assert.equal(hasSameDayContactIdentity(base, [{ leadId: "different", company: "Novo", phone: "08099999999" }]), true);
  assert.equal(hasSameDayContactIdentity(base, [{ leadId: "different", company: "Other", phone: "2347000000000" }]), true);
  assert.equal(hasSameDayContactIdentity(base, [{ leadId: "different", company: "Other", phone: "08011111111" }]), false);
});

test("elapsed-day helper is stable", () => {
  assert.equal(ageDays("2026-11-23T12:00:00Z", new Date("2026-11-26T12:00:00Z")), 3);
});
