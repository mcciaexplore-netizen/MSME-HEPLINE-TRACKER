const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DMY = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

const pad = (n: string | number) => String(n).padStart(2, "0");

/**
 * Parses the timestamp formats seen in the exports and returns "YYYY-MM-DD HH:MM:SS" (IST, as written).
 * Accepts YYYY-MM-DD HH:MM[:SS] (raw export) and DD-MM-YYYY HH:MM[:SS] (after Excel re-save).
 */
export function parseTimestamp(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  let m = ISO.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${pad(m[4] ?? 0)}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
  m = DMY.exec(v);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])} ${pad(m[4] ?? 0)}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
  return null;
}

export const dateOf = (ts: string) => ts.slice(0, 10);

export function minutesOfDay(ts: string): number {
  const [h, m, s] = ts.slice(11).split(":").map(Number);
  return h * 60 + m + (s || 0) / 60;
}

export function parseDuration(value: string | undefined): number {
  const parts = (value ?? "").trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDisplayDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type Period = "today" | "yesterday" | "last7" | "month" | "custom";

export function resolvePeriod(period: Period, from?: string, to?: string, today = todayIST()) {
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "custom":
      if (from && to && ISO.test(from) && ISO.test(to)) return from <= to ? { from, to } : { from: to, to: from };
      return { from: addDays(today, -6), to: today };
    default:
      return { from: addDays(today, -6), to: today };
  }
}
