// Loads rows from the database into the shapes the pure metric engine expects.
import type { PrismaClient } from "@prisma/client";
import { CORE_FIELDS } from "./config";
import { todayIST } from "./dates";
import { computeMetrics, type CallRow, type MetricResult, type TicketRow } from "./metrics";
import { buildResolver, suggestCoordinator, type Source } from "./names";

export async function loadRows(db: PrismaClient, from: string, to: string) {
  const [calls, tickets] = await Promise.all([
    db.call.findMany({ where: { startDate: { gte: from, lte: to } } }),
    db.ticket.findMany({
      where: { OR: [{ createdDate: { gte: from, lte: to } }, { dueDate: { gte: from, lte: to } }] },
    }),
  ]);
  const callRows: CallRow[] = calls.map((c) => ({
    callId: c.callId,
    direction: c.direction,
    status: c.status,
    agentKey: c.agentKey,
    missedKeys: JSON.parse(c.missedKeys) as string[],
    startTime: c.startTime,
    startDate: c.startDate,
    convSeconds: c.convSeconds,
  }));
  const ticketRows: TicketRow[] = tickets.map((t) => ({
    requestId: t.requestId,
    status: t.status,
    createdDate: t.createdDate,
    dueDate: t.dueDate,
    creatorKey: t.creatorKey,
    ownerKey: t.ownerKey,
    fieldFlags: JSON.parse(t.fieldFlags) as Record<string, boolean>,
  }));
  return { calls: callRows, tickets: ticketRows };
}

export interface MetricQuery {
  from: string;
  to: string;
  coordinatorId?: number | null;
}

export async function runMetrics(db: PrismaClient, q: MetricQuery): Promise<MetricResult & { coordinatorNames: Map<number, string> }> {
  const [rows, mappings, coordinators] = await Promise.all([
    loadRows(db, q.from, q.to),
    db.nameMapping.findMany(),
    db.coordinator.findMany({ orderBy: { fullName: "asc" } }),
  ]);
  const result = computeMetrics({
    ...rows,
    resolve: buildResolver(mappings),
    coordinatorIds: coordinators.filter((c) => c.status === "Active").map((c) => c.id),
    from: q.from,
    to: q.to,
    today: todayIST(),
    coreFields: CORE_FIELDS,
    coordinatorFilter: q.coordinatorId ?? null,
  });
  return { ...result, coordinatorNames: new Map(coordinators.map((c) => [c.id, c.fullName])) };
}

/** Matching runs only for raw names never seen before; existing mappings are never re-matched. */
export async function registerNewNames(db: PrismaClient, names: { source: Source; key: string; raw: string }[]) {
  if (!names.length) return [];
  const existing = await db.nameMapping.findMany({ select: { source: true, key: true } });
  const seen = new Set(existing.map((e) => `${e.source}|${e.key}`));
  const fresh = new Map<string, { source: Source; key: string; raw: string }>();
  for (const n of names) if (n.key && !seen.has(`${n.source}|${n.key}`)) fresh.set(`${n.source}|${n.key}`, n);
  if (!fresh.size) return [];
  const active = await db.coordinator.findMany({ where: { status: "Active" } });
  const created = [];
  for (const n of fresh.values()) {
    const match = suggestCoordinator(n.raw, n.source, active);
    created.push(
      await db.nameMapping.create({
        data: {
          source: n.source,
          key: n.key,
          rawName: n.raw,
          status: "Suggested",
          target: match.preselectId ? "COORDINATOR" : null,
          coordinatorId: match.preselectId,
          suggestions: JSON.stringify(match.suggestions),
          note: match.note,
        },
      }),
    );
  }
  return created;
}

/** Rows (calls + tickets) carrying a given raw name, for the Name mapping screen. */
export async function rowCountFor(db: PrismaClient, source: string, key: string) {
  if (source === "Dialer") {
    const [agent, missed] = await Promise.all([
      db.call.count({ where: { agentKey: key } }),
      db.call.count({ where: { missedKeys: { contains: JSON.stringify(key) } } }),
    ]);
    return agent + missed;
  }
  return db.ticket.count({ where: { OR: [{ creatorKey: key }, { ownerKey: key }] } });
}
