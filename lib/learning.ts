import type { Lead } from "../types";
import type { OutboundMessage } from "./outbound";

export const LEARNING_OUTCOMES = ["NO_RESPONSE", "POSITIVE_REPLY", "NEGATIVE_REPLY", "QUESTION", "INTERESTED", "PRICING_REQUEST", "MEETING_REQUEST", "MEETING_BOOKED", "QUALIFIED", "CONVERTED", "FOLLOW_UP_REQUIRED", "NOT_NOW", "REJECTION", "WRONG_CONTACT", "UNSUBSCRIBE", "INVALID_CONTACT", "UNKNOWN"] as const;
export type LearningOutcome = typeof LEARNING_OUTCOMES[number];
export type LearningStatus = "OBSERVING" | "EMERGING" | "VALIDATED" | "STALE" | "REJECTED" | "DISABLED";
export type OutcomeSource = "inferred" | "crm" | "manual" | "unknown";

export interface LearningEvent {
  id: string; leadId: string; outboundId: string; teamMemberId: string; createdAt: string; updatedAt: string;
  message: string; originalGeneratedMessage: string; finalMessage: string; messageType: string; strategyType: string;
  funnelStage: string; leadStatus: string; leadPriority: string; aiBucket?: string; industry?: string; source?: string;
  followUpNumber: number; fingerprint: string; humanEdited: boolean; editType?: string[]; editMagnitude: "none" | "light" | "substantial";
  generatedAt?: string; sentAt?: string; whatsappOpenedAt?: string; outcome: LearningOutcome; outcomeSource: OutcomeSource;
  outcomeRecordedAt?: string; responseTimeSeconds?: number; responseMessage?: string; outcomeConfidence: number;
  attribution: "last_touch" | "sequence_associated" | "unknown";
}

export interface LearningInsight {
  id: string; pattern: string; segment: string; strategyType: string; evidenceCount: number; positiveOutcomeCount: number;
  negativeOutcomeCount: number; responseCount: number; meetingCount: number; conversionCount: number; responseRate: number;
  positiveResponseRate: number; meetingRate: number; conversionRate: number; confidence: number; status: LearningStatus;
  firstObservedAt: string; lastObservedAt: string; updatedAt: string;
}
export interface LearningSummary { totalEvents: number; generated: number; sent: number; responses: number; positiveResponses: number; meetings: number; conversions: number; strategies: Array<{ strategyType: string; sample: number; replyRate: number; meetingRate: number; conversionRate: number }>; humanEdits: Array<{ signal: string; count: number }>; }

export const LEARNING_CONFIG = { minObservations: 10, validationObservations: 20, minInfluenceConfidence: 55, staleAfterDays: 180 };
const POSITIVE = new Set<LearningOutcome>(["POSITIVE_REPLY", "QUESTION", "INTERESTED", "PRICING_REQUEST", "MEETING_REQUEST", "MEETING_BOOKED", "QUALIFIED", "CONVERTED"]);
const NEGATIVE = new Set<LearningOutcome>(["NEGATIVE_REPLY", "REJECTION", "UNSUBSCRIBE", "WRONG_CONTACT", "INVALID_CONTACT", "NOT_NOW"]);
const RESPONSES = new Set<LearningOutcome>([...POSITIVE, ...NEGATIVE]);
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const dayAge = (date: string) => Math.max(0, (Date.now() - new Date(date).getTime()) / 86_400_000);

export function classifyOutcome(reply: string, status?: string): LearningOutcome {
  const value = `${reply} ${status || ""}`.toLowerCase();
  if (/\b(closed|converted|signed|paid)\b/.test(value)) return "CONVERTED";
  if (/\b(meeting|discovery call booked|booked)\b/.test(value)) return "MEETING_BOOKED";
  if (/\b(qualified|qualification)\b/.test(value)) return "QUALIFIED";
  if (/\b(price|pricing|cost|how much)\b/.test(value)) return "PRICING_REQUEST";
  if (/\b(unsubscribe|stop messaging)\b/.test(value)) return "UNSUBSCRIBE";
  if (/\b(wrong (person|contact|number)|invalid)\b/.test(value)) return "WRONG_CONTACT";
  if (/\b(not interested|no thanks|decline|rejection)\b/.test(value)) return "REJECTION";
  if (/\b(not now|later|busy)\b/.test(value)) return "NOT_NOW";
  if (/\?|\b(how|what|when|can you)\b/.test(value)) return "QUESTION";
  if (/\b(yes|interested|let.?s talk|send it|sounds good|keen)\b/.test(value)) return "INTERESTED";
  return reply.trim() ? "POSITIVE_REPLY" : "UNKNOWN";
}
export function responseTimeSeconds(sentAt?: string, replyAt?: string): number | undefined { if (!sentAt || !replyAt) return undefined; const seconds = Math.round((new Date(replyAt).getTime() - new Date(sentAt).getTime()) / 1000); return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined; }
export function deriveEditSignals(original: string, final: string): { edited: boolean; magnitude: LearningEvent["editMagnitude"]; types: string[] } {
  if (original.trim() === final.trim()) return { edited: false, magnitude: "none", types: [] };
  const ratio = Math.abs(original.length - final.length) / Math.max(1, original.length); const types: string[] = [];
  if (original.length !== final.length) types.push(final.length < original.length ? "message_shortened" : "message_lengthened");
  if (words(original).slice(0, 6).join(" ") !== words(final).slice(0, 6).join(" ")) types.push("opening_changed");
  if (/\?/.test(original) !== /\?/.test(final)) types.push("cta_changed");
  if (ratio > .3) types.push("substantial_rewrite");
  return { edited: true, magnitude: ratio > .3 ? "substantial" : "light", types };
}
export function messageFingerprint(message: string, outbound: OutboundMessage, lead: Lead): string { const tokens = words(message); const opening = tokens.slice(0, 3).join("-") || "empty"; const cta = /\?|would you|let me know|book|call|reply/.test(message.toLowerCase()) ? "cta" : "no-cta"; const length = message.length < 180 ? "short" : message.length < 420 ? "medium" : "long"; return [outbound.messageType, outbound.strategy || outbound.salesBrain?.recommendedAction || "default", lead.status, lead.clientType || "all", `fu${lead.followUpCount || 0}`, opening, cta, length].join("|"); }
function relatedReply(lead: Lead, outbound: OutboundMessage) { return !outbound.sentAt ? undefined : (lead.conversationLog || []).filter(item => item.type === "reply" && new Date(item.ts).getTime() >= new Date(outbound.sentAt!).getTime()).sort((a, b) => a.ts.localeCompare(b.ts))[0]; }
export function buildLearningEvent(lead: Lead, outbound: OutboundMessage, existing?: LearningEvent): LearningEvent {
  const reply = relatedReply(lead, outbound); const statusOutcome = ["Closed", "Discovery Call Booked"].includes(lead.status) ? classifyOutcome("", lead.status) : "UNKNOWN"; const inferredOutcome = reply ? classifyOutcome(reply.text, lead.status) : outbound.status === "SENT" ? statusOutcome : "UNKNOWN"; const outcome = existing?.outcomeSource === "manual" ? existing.outcome : inferredOutcome;
  const original = outbound.originalGeneratedMessage || existing?.originalGeneratedMessage || outbound.messageText; const final = outbound.messageText; const edit = deriveEditSignals(original, final); const now = new Date().toISOString();
  return { id: `learning-${outbound.id}`, leadId: lead.id, outboundId: outbound.id, teamMemberId: outbound.userId, createdAt: existing?.createdAt || outbound.generatedAt || now, updatedAt: now, message: final, originalGeneratedMessage: original, finalMessage: final, messageType: outbound.messageType, strategyType: outbound.strategy || outbound.salesBrain?.recommendedAction || outbound.messageType, funnelStage: outbound.salesBrain?.salesStage || lead.status, leadStatus: lead.status, leadPriority: lead.priority, aiBucket: lead.aiBucket, industry: lead.clientType || "all", source: outbound.source, followUpNumber: lead.followUpCount || 0, fingerprint: messageFingerprint(final, outbound, lead), humanEdited: edit.edited, editType: edit.types, editMagnitude: edit.magnitude, generatedAt: outbound.generatedAt, sentAt: outbound.sentAt, whatsappOpenedAt: outbound.whatsappOpenedAt, outcome, outcomeSource: existing?.outcomeSource === "manual" ? "manual" : reply ? "crm" : outcome !== "UNKNOWN" ? "inferred" : "unknown", outcomeRecordedAt: existing?.outcomeSource === "manual" ? existing.outcomeRecordedAt : reply?.ts, responseTimeSeconds: existing?.outcomeSource === "manual" ? existing.responseTimeSeconds : responseTimeSeconds(outbound.sentAt, reply?.ts), responseMessage: existing?.outcomeSource === "manual" ? existing.responseMessage : reply?.text, outcomeConfidence: existing?.outcomeSource === "manual" ? existing.outcomeConfidence : reply ? 85 : outcome !== "UNKNOWN" ? 60 : 0, attribution: existing?.outcomeSource === "manual" ? existing.attribution : reply ? "last_touch" : outcome !== "UNKNOWN" ? "sequence_associated" : "unknown" };
}
/** Transparent score = sample sufficiency × consistency × recency × evidence quality. */
export function calculateConfidence(events: LearningEvent[], positive: number): number { if (!events.length) return 0; const sample = Math.min(1, events.length / LEARNING_CONFIG.validationObservations); const consistency = .5 + Math.abs((positive / events.length) - .5); const recency = events.reduce((sum, event) => sum + Math.max(.25, 1 - dayAge(event.updatedAt) / 365), 0) / events.length; const quality = events.reduce((sum, event) => sum + (event.outcomeSource === "crm" || event.outcomeSource === "manual" ? 1 : .65), 0) / events.length; return Math.round(100 * sample * consistency * recency * quality); }
export function analyzeLearningEvents(events: LearningEvent[], priorInsights: LearningInsight[] = []): LearningInsight[] {
  const prior = new Map(priorInsights.map(insight => [insight.id, insight])); const groups = new Map<string, LearningEvent[]>();
  for (const event of events.filter(event => !!event.sentAt)) { const key = `${event.strategyType}|${event.industry || "all"}`; groups.set(key, [...(groups.get(key) || []), event]); }
  return [...groups.entries()].map(([key, group]) => { const positive = group.filter(event => POSITIVE.has(event.outcome)).length; const negative = group.filter(event => NEGATIVE.has(event.outcome)).length; const responses = group.filter(event => RESPONSES.has(event.outcome)).length; const meetings = group.filter(event => event.outcome === "MEETING_BOOKED").length; const conversions = group.filter(event => event.outcome === "CONVERTED").length; const confidence = calculateConfidence(group, positive); const [strategyType, segment] = key.split("|"); const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); const id = `insight-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`; const old = prior.get(id); const stale = dayAge(sorted.at(-1)!.updatedAt) > LEARNING_CONFIG.staleAfterDays; const status: LearningStatus = old?.status === "DISABLED" || old?.status === "REJECTED" ? old.status : stale ? "STALE" : group.length >= LEARNING_CONFIG.validationObservations && confidence >= LEARNING_CONFIG.minInfluenceConfidence ? "VALIDATED" : group.length >= LEARNING_CONFIG.minObservations ? "EMERGING" : "OBSERVING"; return { id, pattern: `${strategyType} messages for ${segment} prospects have a ${Math.round((positive / group.length) * 100)}% positive-outcome rate across ${group.length} sent messages.`, segment, strategyType, evidenceCount: group.length, positiveOutcomeCount: positive, negativeOutcomeCount: negative, responseCount: responses, meetingCount: meetings, conversionCount: conversions, responseRate: responses / group.length, positiveResponseRate: positive / group.length, meetingRate: meetings / group.length, conversionRate: conversions / group.length, confidence, status, firstObservedAt: old?.firstObservedAt || sorted[0].createdAt, lastObservedAt: sorted.at(-1)!.updatedAt, updatedAt: new Date().toISOString() }; });
}
export function relevantInsights(insights: LearningInsight[], lead: Lead, messageType?: string): LearningInsight[] { return insights.filter(insight => insight.status === "VALIDATED" && insight.confidence >= LEARNING_CONFIG.minInfluenceConfidence && (!messageType || insight.strategyType === messageType || insight.strategyType.includes(messageType)) && (insight.segment === "all" || insight.segment === lead.clientType)).sort((a, b) => b.confidence - a.confidence).slice(0, 3); }
export function summarizeLearning(events: LearningEvent[], insights: LearningInsight[]): LearningSummary { const sent = events.filter(event => !!event.sentAt); const signals = new Map<string, number>(); for (const event of events) for (const signal of event.editType || []) signals.set(signal, (signals.get(signal) || 0) + 1); return { totalEvents: events.length, generated: events.filter(event => !!event.generatedAt).length, sent: sent.length, responses: sent.filter(event => RESPONSES.has(event.outcome)).length, positiveResponses: sent.filter(event => POSITIVE.has(event.outcome)).length, meetings: sent.filter(event => event.outcome === "MEETING_BOOKED").length, conversions: sent.filter(event => event.outcome === "CONVERTED").length, strategies: insights.map(insight => ({ strategyType: insight.strategyType, sample: insight.evidenceCount, replyRate: insight.responseRate, meetingRate: insight.meetingRate, conversionRate: insight.conversionRate })).sort((a, b) => b.sample - a.sample), humanEdits: [...signals.entries()].map(([signal, count]) => ({ signal, count })).sort((a, b) => b.count - a.count) }; }
