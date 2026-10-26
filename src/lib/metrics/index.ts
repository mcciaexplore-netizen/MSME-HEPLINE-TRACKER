// Pure metric engine. The dashboard, API routes and CSV export all call computeMetrics().
// Every call and ticket counts for the coordinator it belongs to; there is no per-day job rule.
import { CALLING_SHARE, SHIFT_HOURS } from "../config";
import { datesBetween, minutesOfDay } from "../dates";
import type { Resolution, Source } from "../names";

export interface CallRow {
  callId: string;
  direction: string; // Outbound | Inbound
  status: string; // Answered | Missed
  agentKey: string; // "" when blank
  missedKeys: string[];
  startTime: string; // YYYY-MM-DD HH:MM:SS
  startDate: string;
  convSeconds: number;
}

export interface TicketRow {
  requestId: string;
  status: string; // Done | Cancelled | Rescheduled | Pending
  createdDate: string;
  dueDate: string | null;
  creatorKey: string;
  ownerKey: string;
  fieldFlags: Record<string, boolean>;
}

export interface MetricInput {
  calls: CallRow[];
  tickets: TicketRow[];
  resolve: (source: Source, key: string) => Resolution;
  coordinatorIds: number[]; // coordinators to report (rows are produced for each of them)
  from: string;
  to: string;
  today: string;
  coreFields: readonly string[];
  coordinatorFilter?: number | null;
}

export interface Counts {
  outboundAnswered: number;
  outboundMissed: number;
  inboundAnswered: number;
  inboundMissed: number;
  convOutSec: number;
  convInSec: number;
  workingHours: number;
  callDays: number; // days with at least one outbound call or answered inbound call
  scheduled: number;
  allotted: number;
  done: number;
  cancelled: number;
  rescheduled: number;
  pending: number;
  dataFilled: number;
}

export interface Derived extends Counts {
  totalCalls: number;
  handledCalls: number; // outbound answered + outbound missed + inbound answered (basis for calls per day)
  convTotalSec: number;
  callsPerDay: number | null;
  callsPerWorkingHour: number | null; // handled calls ÷ the coordinator's own shift hours (8 per call day)
  avgConvMinPerWorkingHour: number | null;
  schedulingRatio: number | null;
  dataRemaining: number;
  executionRate: number | null;
  dataCompletion: number | null;
}

export interface DailyRow {
  date: string;
  coordinatorId: number;
  metrics: Derived;
}

export interface CoordinatorTotal {
  coordinatorId: number;
  metrics: Derived;
}

export interface MetricResult {
  daily: DailyRow[];
  coordinators: CoordinatorTotal[];
  team: Derived;
  inboundMissedNotReached: number;
  unconfirmed: { rows: number; keys: { source: Source; key: string }[] };
  unattributedOutbound: number;
}

export const emptyCounts = (): Counts => ({
  outboundAnswered: 0,
  outboundMissed: 0,
  inboundAnswered: 0,
  inboundMissed: 0,
  convOutSec: 0,
  convInSec: 0,
  workingHours: 0,
  callDays: 0,
  scheduled: 0,
  allotted: 0,
  done: 0,
  cancelled: 0,
  rescheduled: 0,
  pending: 0,
  dataFilled: 0,
});

/**
 * Working hours for one coordinator-day: the fixed 10 am–6 pm shift (8 hours) on any day they made or
 * answered a call, otherwise 0. Swap this function to change the rule.
 */
export function workingHoursRule(callStartMinutes: number[]): number {
  return callStartMinutes.length > 0 ? SHIFT_HOURS : 0;
}

const ratio = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

export function derive(c: Counts): Derived {
  const handledCalls = c.outboundAnswered + c.outboundMissed + c.inboundAnswered;
  const totalCalls = handledCalls + c.inboundMissed;
  const convTotalSec = c.convOutSec + c.convInSec;
  return {
    ...c,
    totalCalls,
    handledCalls,
    convTotalSec,
    callsPerDay: c.callDays > 0 ? handledCalls / c.callDays : null,
    // Team: calls ÷ (8 h × coordinator call days) = the average coordinator's calls in an hour of their shift.
    callsPerWorkingHour: c.workingHours > 0 ? handledCalls / c.workingHours : null,
    avgConvMinPerWorkingHour: c.workingHours > 0 ? convTotalSec / 60 / c.workingHours : null,
    schedulingRatio: ratio(c.scheduled, c.outboundAnswered),
    dataRemaining: c.done - c.dataFilled,
    executionRate: ratio(c.done, c.allotted),
    dataCompletion: ratio(c.dataFilled, c.done),
  };
}

/**
 * Team totals. Conversation per working hour counts only half the coordinators who were on calls each day
 * (CALLING_SHARE), because the other half run meetings: talk minutes ÷ (coordinator call days × 0.5 × 8 h).
 */
export function deriveTeam(c: Counts): Derived {
  const d = derive(c);
  const hours = c.callDays * CALLING_SHARE * SHIFT_HOURS;
  return { ...d, avgConvMinPerWorkingHour: hours > 0 ? d.convTotalSec / 60 / hours : null };
}

export function addCounts(a: Counts, b: Counts): Counts {
  const out = emptyCounts();
  for (const k of Object.keys(out) as (keyof Counts)[]) out[k] = a[k] + b[k];
  return out;
}

export function isDataFilled(t: TicketRow, coreFields: readonly string[]): boolean {
  return t.status === "Done" && coreFields.every((f) => t.fieldFlags[f] === true);
}

export function computeMetrics(input: MetricInput): MetricResult {
  const { from, to, today, resolve } = input;
  const inRange = (d: string | null) => !!d && d >= from && d <= to;
  const include = (id: number) => input.coordinatorFilter == null || input.coordinatorFilter === id;

  const cells = new Map<string, Counts>();
  const starts = new Map<string, number[]>();
  const reported = new Set<number>(input.coordinatorIds.filter(include));
  const unconfirmedKeys = new Map<string, { source: Source; key: string }>();
  const unconfirmedRowIds = new Set<string>();
  let inboundMissedNotReached = 0;
  let unattributedOutbound = 0;
  const teamInboundMissed = new Set<string>();

  const cellKey = (id: number, d: string) => `${id}|${d}`;
  const cell = (id: number, d: string) => {
    const k = cellKey(id, d);
    let c = cells.get(k);
    if (!c) cells.set(k, (c = emptyCounts()));
    return c;
  };
  let currentRowId = "";
  /** Coordinator id for a raw name, or null when it's ignored, unconfirmed or filtered out. */
  const owner = (source: Source, key: string) => {
    const r = resolve(source, key);
    if (r === "IGNORE") return null;
    if (r === null) {
      unconfirmedRowIds.add(currentRowId);
      unconfirmedKeys.set(`${source}|${key}`, { source, key });
      return null;
    }
    if (!include(r)) return null;
    reported.add(r);
    return r;
  };
  const markCallDay = (id: number, d: string, startTime: string) => {
    const k = cellKey(id, d);
    if (!starts.has(k)) starts.set(k, []);
    starts.get(k)!.push(minutesOfDay(startTime));
  };

  for (const call of input.calls) {
    const d = call.startDate;
    if (!inRange(d)) continue;
    currentRowId = `call:${call.callId}`;
    const outbound = call.direction === "Outbound";
    const answered = call.status === "Answered";

    if (!outbound && !answered) {
      if (call.missedKeys.length === 0) {
        inboundMissedNotReached++;
        continue;
      }
      for (const key of call.missedKeys) {
        const id = owner("Dialer", key);
        if (id == null) continue;
        cell(id, d).inboundMissed++;
        teamInboundMissed.add(call.callId);
      }
      continue;
    }

    if (!call.agentKey) {
      if (outbound) unattributedOutbound++;
      continue;
    }
    const id = owner("Dialer", call.agentKey);
    if (id == null) continue;
    const c = cell(id, d);
    if (outbound && answered) {
      c.outboundAnswered++;
      c.convOutSec += call.convSeconds;
    } else if (outbound) c.outboundMissed++;
    else {
      c.inboundAnswered++;
      c.convInSec += call.convSeconds;
    }
    markCallDay(id, d, call.startTime);
  }

  for (const t of input.tickets) {
    currentRowId = `ticket:${t.requestId}`;
    if (inRange(t.createdDate)) {
      const id = owner("Zoho", t.creatorKey);
      if (id != null) cell(id, t.createdDate).scheduled++;
    }
    if (t.dueDate && inRange(t.dueDate) && t.dueDate <= today) {
      const id = owner("Zoho", t.ownerKey);
      if (id != null) {
        const c = cell(id, t.dueDate);
        c.allotted++;
        if (t.status === "Done") c.done++;
        else if (t.status === "Cancelled") c.cancelled++;
        else if (t.status === "Rescheduled") c.rescheduled++;
        else if (t.status === "Pending") c.pending++;
        if (isDataFilled(t, input.coreFields)) c.dataFilled++;
      }
    }
  }

  const dates = datesBetween(from, to);
  const daily: DailyRow[] = [];
  const coordinators: CoordinatorTotal[] = [];
  let team = emptyCounts();

  for (const id of [...reported].sort((a, b) => a - b)) {
    let total = emptyCounts();
    for (const d of dates) {
      const k = cellKey(id, d);
      const c = cells.get(k) ?? emptyCounts();
      c.workingHours = workingHoursRule(starts.get(k) ?? []);
      c.callDays = starts.has(k) ? 1 : 0;
      daily.push({ date: d, coordinatorId: id, metrics: derive(c) });
      total = addCounts(total, c);
    }
    coordinators.push({ coordinatorId: id, metrics: derive(total) });
    team = addCounts(team, total);
  }

  // A call that rang several coordinators counts once per coordinator, but once in the team total.
  team.inboundMissed = teamInboundMissed.size;

  return {
    daily,
    coordinators,
    team: deriveTeam(team),
    inboundMissedNotReached,
    unconfirmed: { rows: unconfirmedRowIds.size, keys: [...unconfirmedKeys.values()] },
    unattributedOutbound,
  };
}

export function formatHM(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, "0")}m`;
}

export const formatPct = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);
export const formatNum1 = (v: number | null) => (v == null ? "–" : v.toFixed(1));
