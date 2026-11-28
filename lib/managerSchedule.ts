export type ManagerReportJob = "manager_morning_briefing" | "manager_evening_report";

export function getLagosClock(date: Date = new Date()): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: values.year + "-" + values.month + "-" + values.day,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function isManagerReportWindowOpen(jobName: ManagerReportJob, date: Date = new Date()): boolean {
  const { hour, minute } = getLagosClock(date);
  const currentMinute = hour * 60 + minute;
  if (jobName === "manager_morning_briefing") return currentMinute >= 7 * 60 && currentMinute < 10 * 60;
  return currentMinute >= 18 * 60 && currentMinute < 20 * 60;
}
