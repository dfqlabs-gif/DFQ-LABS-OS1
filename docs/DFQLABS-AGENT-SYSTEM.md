# DFQLABS OS1 — AI Agent System

This implementation lives inside the existing DFQLABS OS 1 Express/React/PostgreSQL application. It does not require a separate CRM, Supabase project, paid WhatsApp provider, or additional Render service.

## Operating boundary

- Default mode is `queue_only`. Autopilot is deliberately unavailable.
- Scout discoveries, generated DMs, follow-ups, inbound reply drafts, and LinkedIn articles are staged for founder review.
- Only a WhatsApp message explicitly approved by a founder can enter the dispatcher.
- LinkedIn articles are never auto-published.
- Do-not-contact controls override approvals and are checked again immediately before sending.
- DFQ-MAN and OS2 are separate projects and are not part of this system.

## Agent schedule (Africa/Lagos)

| Time | Agent | Work |
| --- | --- | --- |
| 08:00 daily | Scout | Uses Gemini Google Search grounding to find up to 10 real-estate businesses; stages sourced candidates. City rotation: Abuja, Lagos, Port Harcourt. |
| 09:00 daily | Writer | Selects up to 10 eligible, untouched CRM leads and stages context-aware first messages. |
| 10:00 Monday/Thursday | Writer | Stages a 600–900 word LinkedIn thought-leadership article. |
| 14:00 daily | Closer | Finds eligible 48–72 hour waiting threads and stages fresh follow-ups. |
| Every 45–90 seconds | Dispatcher | Sends at most one approved WhatsApp item per tick, subject to caps, DNC and bridge status. |

The scheduler runs inside the existing OS1 web process. PostgreSQL advisory locks and a schedule ledger prevent duplicate runs across multiple instances/restarts. No separate worker or cron service is provisioned.

## WhatsApp Web bridge

The bridge uses the open-source Baileys WhatsApp Web protocol library. It is **not** the official WhatsApp Cloud API and is not endorsed by WhatsApp. Unofficial clients can break, be logged out, or lead to account restrictions. Connect only an account the founder owns or is authorized to use. Use a low-volume test account first.

### Required Render environment variable

Before connecting the QR code, add:

- `WHATSAPP_SESSION_ENCRYPTION_KEY` — a random secret of at least 32 characters.

Generate a secret in a secure terminal with `openssl rand -base64 48`. Put the generated value directly into the OS1 Render environment; never commit it, paste it into chat, or put it in source control.

The WhatsApp credentials and Signal keys are encrypted with AES-256-GCM before being stored in OS1 PostgreSQL. The encryption key itself remains in the Render environment. No paid persistent disk is required. If the encryption key is lost or changed, the stored session cannot be decrypted and WhatsApp must be linked again.

The QR code is visible only through founder-authenticated OS1 endpoints. Keep the bridge on a single OS1 instance for reliable QR/status handling.

### Connect and test

1. Deploy the reviewed OS1 branch to an approved test environment and configure `WHATSAPP_SESSION_ENCRYPTION_KEY`.
2. Sign in with the founder account and open **AI Agents & Review Queue**.
3. Select **Connect WhatsApp**.
4. On the authorized phone, open WhatsApp → Linked Devices → Link a Device and scan the QR code.
5. Confirm the dashboard shows **Connected**.
6. Send a test message from a separate controlled WhatsApp account. Verify it is appended to the correct CRM conversation and a contextual reply appears in the Review Queue.
7. Approve a draft only to a controlled test number. Verify the WhatsApp delivery, the external message ID, and the canonical OS1 outbound history.
8. Test an explicit opt-out and confirm pending/approved drafts are cancelled and the phone is suppressed.

The bridge currently handles one-to-one text messages and common text captions. Group chats, status messages and non-text-only events are intentionally ignored.

## Review Queue and dispatch

- Queue actions: new lead, inbound log, outreach DM, value DM, follow-up, LinkedIn article.
- Individual review supports editing, approval and rejection. Batch review supports up to 30 pending items; Scout lead creation always requires individual approval.
- Approving a Scout item creates a lead in the canonical OS1 `leads` table after a duplicate check.
- Approving a LinkedIn article marks it ready for manual publishing only.
- Approving an outbound message places it in the dispatcher. If WhatsApp is not connected, it remains approved.
- The dispatcher rechecks lead-level and phone-level suppression immediately before sending, records the message through the existing canonical outbound commit path, and stores the WhatsApp external message ID.
- A send with an uncertain outcome is marked failed for manual verification; it is not automatically retried.

## Daily caps

- 30 proactive outreach/follow-up messages per Lagos calendar day.
- 30 value DMs per Lagos calendar day.
- Reactive replies to inbound WhatsApp messages do not consume proactive outreach caps.
- Queue generation caps include pending, approved, sending and sent items to avoid over-staging.

## Opt-out safety

The system conservatively detects clear communication opt-outs (for example, “stop”, “unsubscribe”, “remove me”, and “I'm not interested”) without treating “not interested in this property” as an opt-out. Matched leads receive a lead-level DNC flag. An unmatched sender who opts out is stored in a phone-level suppression table so creating a lead later cannot silently re-enable outreach.

Founders can review lead-level DNC records and unmatched phone suppressions. Remove a suppression only after explicit opt-in.

## Circuit breakers and audit

Each agent records outcomes in `agent_logs`. Two consecutive failures halt that agent. The founder can reset a circuit breaker from the dashboard after reviewing the cause. Queue decisions, DNC changes, lead creation, article generation and sends are written to the append-only audit table.

## Gemini and Scout

- Existing OS1 Gemini configuration powers Writer, Closer, inbox reply drafts and articles.
- Scout uses the Gemini 2.5 Flash Google Search grounding tool and stores grounding source URLs and returned search suggestions with each candidate.
- Scout candidates are skipped if their source URL is not present in the grounding metadata or if they appear to duplicate an existing CRM lead or another staged candidate.
- Google Search grounding consumes the configured Gemini API quota. No Serper, Apify or paid search provider is required by this implementation.

## Deployment boundary

This branch is not production. The Render production service must remain on its current branch until the founder approves merge/deployment. Run the QR, inbound, DNC, approved-send and canonical-history acceptance tests in a test deployment before production rollout.
