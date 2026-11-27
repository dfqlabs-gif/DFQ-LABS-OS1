const baseUrl = (process.env.MANAGER_SCHEDULER_URL || "").replace(/\/+$/, "");
const secret = process.env.MANAGER_SCHEDULER_SECRET || "";

if (!baseUrl || !secret) {
  console.error("Manager scheduler URL and secret must be configured.");
  process.exit(1);
}

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  hourCycle: "h23",
}).formatToParts(new Date());
const hour = Number(parts.find((part) => part.type === "hour")?.value);
const jobName = hour >= 7 && hour < 10
  ? "manager_morning_briefing"
  : hour >= 18 && hour < 20
    ? "manager_evening_report"
    : null;

if (!jobName) {
  console.log("No manager report is due at this Lagos time; exiting without a request.");
  process.exit(0);
}

const response = await fetch(baseUrl + "/api/internal/manager-schedule", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-manager-scheduler-secret": secret,
  },
  body: JSON.stringify({ jobName }),
  signal: AbortSignal.timeout(25_000),
});
const body = await response.text();
console.log("Manager scheduler trigger:", response.status, body.slice(0, 1000));

if (!response.ok && response.status !== 202) {
  process.exitCode = 1;
}
