import { formatInTimeZone } from "date-fns-tz";
export const states = [
  "WAITING",
  "CALLED",
  "SERVING",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type Status = (typeof states)[number];
const edges: Record<Status, readonly Status[]> = {
  WAITING: ["CALLED", "CANCELLED", "EXPIRED"],
  CALLED: ["SERVING", "MISSED", "CANCELLED"],
  SERVING: ["COMPLETED"],
  MISSED: ["WAITING", "CANCELLED", "EXPIRED"],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};
export const canTransition = (from: string, to: string) =>
  (edges[from as Status] ?? []).includes(to as Status);
export const localDate = (now: Date, timezone = "Asia/Karachi") =>
  formatInTimeZone(now, timezone, "yyyy-MM-dd");
export type Hours = { days: number[]; open: string; close: string };
export function withinHours(now: Date, timezone: string, hours: Hours) {
  const day = Number(formatInTimeZone(now, timezone, "i")) % 7;
  const time = formatInTimeZone(now, timezone, "HH:mm");
  return hours.days.includes(day) && time >= hours.open && time < hours.close;
}
export const graceElapsed = (calledAt: Date, grace: number, now: Date) =>
  now.getTime() - calledAt.getTime() >= grace * 1000;
export function canRejoin(
  t: { status: string; rejoinCount: number; localDate: string },
  today: string,
  open: boolean,
) {
  return (
    t.status === "MISSED" &&
    t.rejoinCount === 0 &&
    t.localDate === today &&
    open
  );
}
export type Estimate = {
  available: boolean;
  label: string;
  low?: number;
  high?: number;
  seconds?: number;
  averageSeconds: number;
  source: string;
  samples: number;
  ahead: number;
  activeCounters: number;
  explanation: string;
};
type Work = {
  status: string;
  calledAt: Date | null;
  serviceStartedAt: Date | null;
};
export function estimateWait(input: {
  now: Date;
  open: boolean;
  baseline: number;
  grace: number;
  durations: number[];
  counters: { state: string; work?: Work }[];
  ahead: number;
}): Estimate {
  // Fixed demo rule: exclude durations outside 30 seconds–2 hours. Raw history is untouched.
  const samples = input.durations
    .filter((n) => n >= 30 && n <= 7200)
    .slice(0, 30);
  const recent = samples.length >= 5;
  const average = recent
    ? samples.reduce((a, b) => a + b, 0) / samples.length
    : input.baseline;
  const counters = input.counters.filter((c) => c.state === "ACTIVE");
  const base = {
    averageSeconds: Math.round(average),
    source: recent ? "Recent completed visits" : "Configured baseline",
    samples: samples.length,
    ahead: input.ahead,
    activeCounters: counters.length,
  };
  if (!input.open || !counters.length)
    return {
      ...base,
      available: false,
      label: "Estimate unavailable",
      explanation: !input.open
        ? "Service is paused, closed, or outside opening hours."
        : "No active counters. Your place is preserved.",
    };
  const availability = counters.map((c) => {
    if (c.work?.status === "SERVING" && c.work.serviceStartedAt)
      return Math.max(
        0,
        average - (+input.now - +c.work.serviceStartedAt) / 1000,
      );
    if (c.work?.status === "CALLED" && c.work.calledAt)
      return (
        Math.max(0, input.grace - (+input.now - +c.work.calledAt) / 1000) +
        average
      );
    return 0;
  });
  let seconds = 0;
  for (let i = 0; i <= input.ahead; i++) {
    const index = availability.indexOf(Math.min(...availability));
    seconds = availability[index];
    availability[index] += average;
  }
  const low = Math.max(1, Math.floor((seconds * 0.75) / 60));
  const high = Math.max(low + 1, Math.ceil((seconds * 1.4) / 60));
  return {
    ...base,
    available: true,
    seconds,
    low,
    high,
    label: seconds < 60 ? "You may be called next" : `${low}–${high} min`,
    explanation:
      "A heuristic range, not a promise. FIFO work is assigned to the next available active counter; longer visits, missed calls, and pauses can change it.",
  };
}
