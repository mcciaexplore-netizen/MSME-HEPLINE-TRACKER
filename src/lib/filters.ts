import { resolvePeriod, type Period } from "./dates";

export interface Filters {
  period: Period;
  from: string;
  to: string;
  coordinatorId: number | null;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const get = (p: Params, k: string) => {
  if (p instanceof URLSearchParams) return p.get(k) ?? undefined;
  const v = p[k];
  return Array.isArray(v) ? v[0] : v;
};

export function parseFilters(p: Params): Filters {
  const periods: Period[] = ["today", "yesterday", "last7", "month", "custom"];
  const raw = get(p, "period") as Period | undefined;
  const period = raw && periods.includes(raw) ? raw : "today";
  const { from, to } = resolvePeriod(period, get(p, "from"), get(p, "to"));
  const cid = Number(get(p, "coordinator"));
  return { period, from, to, coordinatorId: Number.isInteger(cid) && cid > 0 ? cid : null };
}

export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams({ period: f.period });
  if (f.period === "custom") {
    q.set("from", f.from);
    q.set("to", f.to);
  }
  if (f.coordinatorId) q.set("coordinator", String(f.coordinatorId));
  return q.toString();
}
