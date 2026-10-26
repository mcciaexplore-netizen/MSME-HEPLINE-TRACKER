import { CORE_FIELDS } from "@/lib/config";
import { computeMetrics, type CallRow, type MetricInput, type TicketRow } from "@/lib/metrics";
import type { Resolution, Source } from "@/lib/names";

// Coordinators: 1 = Neha (dialer "neha agarwal", zoho "agrawal"), 2 = Aarush ("aarush majahan", "mahajan")
export const NEHA = 1;
export const AARUSH = 2;

const names: Record<string, Resolution> = {
  "Dialer|neha agarwal": NEHA,
  "Dialer|aarush majahan": AARUSH,
  "Zoho|agrawal": NEHA,
  "Zoho|mahajan": AARUSH,
  "Zoho|helpline": "IGNORE",
};
export const resolve = (s: Source, k: string): Resolution => (k ? names[`${s}|${k}`] ?? null : "IGNORE");

let n = 0;
export function call(p: Partial<CallRow> & { date?: string; time?: string }): CallRow {
  const date = p.date ?? "2026-10-20";
  return {
    callId: p.callId ?? `C${++n}`,
    direction: p.direction ?? "Outbound",
    status: p.status ?? "Answered",
    agentKey: p.agentKey ?? "neha agarwal",
    missedKeys: p.missedKeys ?? [],
    startTime: `${date} ${p.time ?? "10:00:00"}`,
    startDate: date,
    convSeconds: p.convSeconds ?? 0,
  };
}

export const allFilled = () => Object.fromEntries(CORE_FIELDS.map((f) => [f, true]));

export function ticket(p: Partial<TicketRow>): TicketRow {
  return {
    requestId: p.requestId ?? `T${++n}`,
    status: p.status ?? "Pending",
    createdDate: p.createdDate ?? "2026-10-19",
    dueDate: p.dueDate === undefined ? "2026-10-20" : p.dueDate,
    creatorKey: p.creatorKey ?? "agrawal",
    ownerKey: p.ownerKey ?? "agrawal",
    fieldFlags: p.fieldFlags ?? {},
  };
}

export function run(calls: CallRow[], tickets: TicketRow[], extra: Partial<MetricInput> = {}) {
  return computeMetrics({
    calls,
    tickets,
    resolve,
    coordinatorIds: [NEHA, AARUSH],
    from: "2026-10-17",
    to: "2026-10-23",
    today: "2026-10-23",
    coreFields: CORE_FIELDS,
    ...extra,
  });
}

export const of = (r: ReturnType<typeof run>, id: number) => r.coordinators.find((c) => c.coordinatorId === id)!.metrics;
