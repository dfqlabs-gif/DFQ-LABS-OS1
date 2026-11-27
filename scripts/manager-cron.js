const jobName = process.argv[2] === "morning"
  ? "manager_morning_briefing"
  : process.argv[2] === "evening"
    ? "manager_evening_report"
    : null;

const endpoint = process.env.MANAGER_SCHEDULER_URL;
const secret = process.env.MANAGER_SCHEDULER_SECRET;

if (!jobName || !endpoint || !secret) {
  throw new Error("Manager cron requires a valid job argument, MANAGER_SCHEDULER_URL and MANAGER_SCHEDULER_SECRET.");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const maxAttempts = 5;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  let response;
  let payload = {};
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manager-scheduler-secret": secret,
      },
      body: JSON.stringify({ jobName }),
      signal: AbortSignal.timeout(180_000),
    });
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    if (attempt === maxAttempts) throw error;
    const delay = Math.min(60_000, 10_000 * attempt);
    console.error("Manager scheduler endpoint unavailable; retrying.", { attempt, delayMs: delay });
    await sleep(delay);
    continue;
  }

  if (response.ok && payload.status === "completed") {
    console.log("Manager report delivery confirmed.", { jobName, status: payload.status });
    process.exit(0);
  }

  if (response.status === 202 || response.status === 503) {
    if (attempt === maxAttempts) {
      throw new Error("Manager report was not confirmed after " + maxAttempts + " attempts. Last status: " + String(payload.status || response.status));
    }
    const delay = Math.max(1_000, Math.min(3_600_000, Number(payload.retryAfterMs) || 30_000));
    console.error("Manager report is not yet confirmed; retrying.", { jobName, status: payload.status || response.status, attempt, delayMs: delay });
    await sleep(delay);
    continue;
  }

  throw new Error("Manager report scheduler rejected the run: " + String(payload.error || payload.status || response.status));
}

throw new Error("Manager report delivery could not be confirmed.");
