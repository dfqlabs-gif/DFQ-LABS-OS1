import { randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any> };
type ExpressLike = { get: (path: string, handler: (req: any, res: any) => any) => void };

function encryptionKey(): Buffer {
  const raw = String(process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("LinkedIn token encryption is not configured.");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("LINKEDIN_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}
function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
function decrypt(value: string): string {
  const [ivText, tagText, dataText] = String(value || "").split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Stored LinkedIn credential is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64")), decipher.final()]).toString("utf8");
}
function config() {
  const clientId = String(process.env.LINKEDIN_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.LINKEDIN_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.LINKEDIN_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("LinkedIn OAuth credentials are not fully configured.");
  return { clientId, clientSecret, redirectUri, apiVersion: String(process.env.LINKEDIN_API_VERSION || "202611").trim() };
}

export async function initializeLinkedInTables(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
      state_hash TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS linkedin_credentials (
      id INTEGER PRIMARY KEY CHECK (id=1),
      access_token_encrypted TEXT NOT NULL,
      member_sub TEXT NOT NULL,
      member_name TEXT,
      scopes TEXT NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function createLinkedInAuthorizationUrl(db: Queryable): Promise<string> {
  const cfg = config();
  const state = randomBytes(32).toString("hex");
  const stateHash = createHash("sha256").update(state).digest("hex");
  await db.query("DELETE FROM linkedin_oauth_states WHERE expires_at < NOW()");
  await db.query("INSERT INTO linkedin_oauth_states (state_hash, expires_at) VALUES ($1, NOW() + INTERVAL '10 minutes')", [stateHash]);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
    scope: "openid profile email w_member_social",
  });
  return "https://www.linkedin.com/oauth/v2/authorization?" + params.toString();
}

export function registerLinkedInRoutes(
  app: ExpressLike,
  db: Queryable,
): void {
  app.get("/api/auth/linkedin/callback", async (req, res) => {
    const state = String(req.query?.state || "");
    const code = String(req.query?.code || "");
    const providerError = String(req.query?.error_description || req.query?.error || "");
    if (providerError) return res.status(400).send("LinkedIn authorization was not completed. Return to Harry and run /linkedin_connect to try again.");
    if (!/^[a-f0-9]{64}$/i.test(state) || !code) return res.status(400).send("Invalid LinkedIn authorization response.");
    try {
      const stateHash = createHash("sha256").update(state).digest("hex");
      const stateResult = await db.query(
        "DELETE FROM linkedin_oauth_states WHERE state_hash=$1 AND expires_at > NOW() RETURNING state_hash",
        [stateHash],
      );
      if (!stateResult.rowCount) return res.status(401).send("LinkedIn connection expired or state validation failed. Return to Harry and run /linkedin_connect again.");

      const cfg = config();
      const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
        }),
      });
      const tokenData: any = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error("LinkedIn token exchange failed:", tokenResponse.status, JSON.stringify(tokenData).slice(0, 500));
        return res.status(502).send("LinkedIn could not complete authorization. Return to Harry and run /linkedin_connect again.");
      }

      const profileResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: "Bearer " + tokenData.access_token },
      });
      const profile: any = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok || !profile.sub) {
        console.error("LinkedIn member identity lookup failed:", profileResponse.status, JSON.stringify(profile).slice(0, 300));
        return res.status(502).send("LinkedIn authorization succeeded, but the member identity could not be verified. No publishing connection was saved.");
      }

      const expiresIn = Math.max(60, Number(tokenData.expires_in || 0));
      await db.query(
        `INSERT INTO linkedin_credentials (id, access_token_encrypted, member_sub, member_name, scopes, expires_at, updated_at)
         VALUES (1,$1,$2,$3,$4,NOW() + ($5::text || ' seconds')::interval,NOW())
         ON CONFLICT (id) DO UPDATE SET access_token_encrypted=EXCLUDED.access_token_encrypted,
           member_sub=EXCLUDED.member_sub, member_name=EXCLUDED.member_name, scopes=EXCLUDED.scopes,
           expires_at=EXCLUDED.expires_at, updated_at=NOW()`,
        [encrypt(String(tokenData.access_token)), String(profile.sub), String(profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ")), String(tokenData.scope || "openid profile email w_member_social"), String(expiresIn)],
      );
      return res.status(200).send(
        "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>LinkedIn connected</title></head><body style='font-family:Arial,sans-serif;max-width:620px;margin:12vh auto;padding:24px;color:#17212b'><h1>LinkedIn connected successfully</h1><p>Your personal LinkedIn member account is now connected to DFQLABS OS1.</p><p>Harry will still require your explicit Telegram approval before publishing any post.</p><p>You can close this window and return to Telegram.</p></body></html>",
      );
    } catch (error: any) {
      console.error("LinkedIn OAuth callback failed:", String(error?.message || error).slice(0, 300));
      return res.status(500).send("LinkedIn connection could not be saved securely. No post was published.");
    }
  });
}

export function validateApprovedLinkedInDraft(
  commentary: string,
  approvedHash: string,
  approvedCharacterCount: number,
): { contentHash: string; characterCount: number; wordCount: number } {
  const contentHash = createHash("sha256").update(commentary, "utf8").digest("hex");
  const characterCount = Array.from(commentary).length;
  const wordCount = commentary.trim().split(/\s+/).filter(Boolean).length;
  if (!commentary.trim()) throw new Error("The approved LinkedIn draft is empty.");
  if (!approvedHash || approvedHash !== contentHash) {
    throw new Error("The approved LinkedIn content hash does not match the stored draft. Nothing was published; generate a fresh review card.");
  }
  if (Number(approvedCharacterCount) !== characterCount) {
    throw new Error("The approved LinkedIn character count does not match the stored draft. Nothing was published.");
  }
  if (characterCount > 3000) {
    throw new Error("The approved LinkedIn feed post exceeds the 3,000-character limit. Nothing was published.");
  }
  return { contentHash, characterCount, wordCount };
}

export async function publishLinkedInArticle(db: Queryable, queueId: string): Promise<{ postId: string; memberName: string; alreadyPublished?: boolean }> {
  const claim = await db.query(
    "UPDATE agent_queue SET status='sending', updated_at=NOW(), error_log=NULL WHERE id=$1 AND action_type='linkedin_article' AND status='approved' RETURNING id, draft_content, metadata",
    [queueId],
  );
  if (!claim.rowCount) {
    const existing = await db.query("SELECT status, external_message_id FROM agent_queue WHERE id=$1 AND action_type='linkedin_article'", [queueId]);
    if (existing.rows[0]?.status === "sent" && existing.rows[0]?.external_message_id) {
      return { postId: String(existing.rows[0].external_message_id), memberName: "", alreadyPublished: true };
    }
    throw new Error("This LinkedIn draft is not in an approved, publishable state. No post was sent.");
  }

  try {
    const credential = await db.query("SELECT * FROM linkedin_credentials WHERE id=1");
    if (!credential.rowCount) throw new Error("Your personal LinkedIn account is not connected. Run /linkedin_connect in Telegram.");
    const row = credential.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now() + 60_000) throw new Error("LinkedIn access has expired. Run /linkedin_connect in Telegram to reconnect.");
    if (!String(row.scopes || "").split(/[ ,]+/).includes("w_member_social")) throw new Error("LinkedIn did not grant w_member_social. Reconnect and approve the Share on LinkedIn permission.");
    const accessToken = decrypt(String(row.access_token_encrypted));
    const cfg = config();
    // Publish the exact founder-approved UTF-8 text. Do not trim, slice, or
    // otherwise rewrite the payload after approval.
    const commentary = String(claim.rows[0].draft_content ?? "");
    const metadata = claim.rows[0].metadata && typeof claim.rows[0].metadata === "object" ? claim.rows[0].metadata : {};
    const integrity = validateApprovedLinkedInDraft(
      commentary,
      String(metadata.approvedContentHash || ""),
      Number(metadata.approvedCharacterCount),
    );
    const { contentHash, characterCount, wordCount } = integrity;
    const postBody = {
      author: "urn:li:person:" + String(row.member_sub),
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    await db.query(
      "UPDATE agent_queue SET metadata=metadata || $1::jsonb, updated_at=NOW() WHERE id=$2 AND status='sending'",
      [JSON.stringify({ linkedinSubmissionContentHash: contentHash, linkedinSubmissionCharacterCount: characterCount, linkedinSubmissionWordCount: wordCount }), queueId],
    );
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
        "LinkedIn-Version": cfg.apiVersion,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.error("LinkedIn post creation failed:", response.status, responseText.slice(0, 600));
      throw new Error("LinkedIn rejected the post (HTTP " + response.status + "). The item is marked failed; review the draft and connection before trying again.");
    }
    const postId = response.headers.get("x-restli-id") || response.headers.get("x-linkedin-id");
    if (!postId) {
      await db.query("UPDATE agent_queue SET status='delivery_unknown', error_log='LinkedIn accepted the request but returned no post ID. Verify the profile before any retry.', updated_at=NOW() WHERE id=$1 AND status='sending'", [queueId]);
      throw new Error("LinkedIn accepted the request but returned no post ID. Delivery is uncertain; check your LinkedIn profile before retrying.");
    }
    await db.query(
      "UPDATE agent_queue SET status='sent', external_message_id=$1, sent_at=NOW(), updated_at=NOW(), error_log=NULL, metadata=metadata || $2::jsonb WHERE id=$3 AND status='sending'",
      [postId, JSON.stringify({ linkedinPublished: true, linkedinPublishedAt: new Date().toISOString(), linkedinPublishedContentHash: contentHash, linkedinPublishedCharacterCount: characterCount, linkedinPublishedWordCount: wordCount, linkedinPublicationVerified: "accepted_by_linkedin_api_not_read_back" }), queueId],
    );
    return { postId, memberName: String(row.member_name || "") };
  } catch (error: any) {
    const message = String(error?.message || "LinkedIn publishing failed").slice(0, 1000);
    const uncertain = /fetch failed|timeout|timed out|aborted|econnreset|econnrefused|socket|network error|und_err/i.test(message);
    await db.query(
      "UPDATE agent_queue SET status=CASE WHEN status='sending' THEN $1 ELSE status END, error_log=$2, updated_at=NOW() WHERE id=$3 AND status IN ('sending','delivery_unknown')",
      [uncertain ? "delivery_unknown" : "failed", message, queueId],
    ).catch(() => {});
    throw error;
  }
}
