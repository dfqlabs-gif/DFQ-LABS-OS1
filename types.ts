export interface LeadAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string; // raw text for text/json/html; base64 data URL for pdf/images
  uploadedAt: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone?: string;
  instagram?: string;
  whatsapp?: string;
  email?: string;
  source: string;
  clientType: string;
  service: string;
  status: string;
  priority: string;
  assignedTo: string;
  notes: string;
  dmText: string;
  prospectInitialResponse: string;
  prospectLatestResponse: string;
  conversationLog: Array<{
    ts: string;
    type: "dm" | "reply" | "note" | "status_change";
    label: string;
    text: string;
    by: string;
  }>;
  nextAction: string;
  nextActionDate: string;
  dateAdded: string;
  lastContacted: string;
  lastMeaningfulTouchpoint: string;
  awaitingReplySince: string;
  meetingScheduledAt: string;
  meetingPrepNote: string;
  followUpCount: number;
  weekAdded: string;
  completedFollowUps: string[];
  deliveryStage?: string;
  deliveryNote?: string;
  betaCandidate: boolean;
  autoFollowUpDate: string | null;
  autoFollowUpReason: string;
  aiBucket?: string;
  aiReason?: string;
  aiNextAction?: string;
  aiClassifiedAt?: string;
  // Lead integrity / duplicate-prevention system
  mergedInto?: string;
  mergedFrom?: string[];
  auditLog?: Array<{
    ts: string;
    by: string;
    action: string;
    field?: string;
    previousValue?: string;
    newValue?: string;
  }>;
  attachments?: LeadAttachment[];
}

export interface Stats {
  xp: number;
  completedDates: string[];
  totalFollowUps: number;
  nnd: Record<string, string[]>;
  dailyQueue: any;
  ignoredDuplicatePairs?: string[];
}
