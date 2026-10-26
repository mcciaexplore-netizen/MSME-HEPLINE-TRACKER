import type { PrismaClient } from "@prisma/client";
import type { Readable } from "node:stream";
import { registerNewNames, runMetrics } from "../data";
import type { Source } from "../names";
import {
  DIALER_COLUMNS,
  DIALER_REQUIRED,
  ZOHO_COLUMNS,
  derivedCallId,
  parseDialerRow,
  parseZohoRow,
  sameCall,
  streamCsv,
  ticketAction,
  type CallRecord,
  type TicketRecord,
} from "./parse";

export interface FileStats {
  file: string;
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface UploadSummary {
  dialer?: FileStats & { inboundNotReached: number };
  zoho?: FileStats;
  newNames: { source: string; rawName: string }[];
  unconfirmedRows: number; // rows in the uploaded dates whose names still await confirmation
  unattributedOutbound: number; // outbound calls with a blank agent
  warnings: string[];
}

const CHUNK = 500;

const span = (stats: FileStats, d: string | null) => {
  if (!d) return;
  if (!stats.minDate || d < stats.minDate) stats.minDate = d;
  if (!stats.maxDate || d > stats.maxDate) stats.maxDate = d;
};

const callData = (c: CallRecord, uploadId: number) => ({
  ...c,
  missedKeys: JSON.stringify(c.missedKeys),
  missedRaw: JSON.stringify(c.missedRaw),
  uploadId,
});

export async function ingestDialer(db: PrismaClient, input: Readable | string, file: string, uploadId: number, names: NameBag) {
  const parsed: CallRecord[] = [];
  const stats: FileStats & { inboundNotReached: number } = { file, read: 0, inserted: 0, updated: 0, skipped: 0, minDate: null, maxDate: null, inboundNotReached: 0 };
  const seenInFile = new Set<string>();
  const occurrences = new Map<string, number>();
  const { rows } = await streamCsv(input, file, DIALER_REQUIRED, (r) => {
    const c = parseDialerRow(r);
    if (c && !c.callId) {
      // No Call ID in the sheet: derive a stable one so re-uploads match instead of duplicating.
      const base = derivedCallId(c, 0);
      const n = occurrences.get(base) ?? 0;
      occurrences.set(base, n + 1);
      c.callId = derivedCallId(c, n);
    }
    if (!c || seenInFile.has(c.callId)) {
      stats.skipped++;
      return;
    }
    seenInFile.add(c.callId);
    parsed.push(c);
    span(stats, c.startDate);
    if (c.agentKey) names.add("Dialer", c.agentKey, c.agentRaw);
    c.missedKeys.forEach((k, i) => names.add("Dialer", k, c.missedRaw[i]));
    if (c.direction === "Inbound" && c.status === "Missed" && c.missedKeys.length === 0) stats.inboundNotReached++;
  }, DIALER_COLUMNS);
  stats.read = rows;

  for (let i = 0; i < parsed.length; i += CHUNK) {
    const chunk = parsed.slice(i, i + CHUNK);
    const existing = await db.call.findMany({ where: { callId: { in: chunk.map((c) => c.callId) } } });
    const byId = new Map(existing.map((e) => [e.callId, e]));
    const inserts: CallRecord[] = [];
    const updates: CallRecord[] = [];
    for (const c of chunk) {
      const e = byId.get(c.callId);
      if (!e) inserts.push(c);
      else {
        const prev: CallRecord = {
          callId: e.callId, direction: e.direction, status: e.status, agentRaw: e.agentRaw, agentKey: e.agentKey,
          missedRaw: JSON.parse(e.missedRaw), missedKeys: JSON.parse(e.missedKeys), startTime: e.startTime,
          startDate: e.startDate, convSeconds: e.convSeconds,
        };
        if (sameCall(prev, c)) stats.skipped++;
        else updates.push(c);
      }
    }
    await db.$transaction([
      db.call.createMany({ data: inserts.map((c) => callData(c, uploadId)) }),
      ...updates.map((c) => db.call.update({ where: { callId: c.callId }, data: callData(c, uploadId) })),
    ]);
    stats.inserted += inserts.length;
    stats.updated += updates.length;
  }
  return stats;
}

const ticketData = (t: TicketRecord, uploadId: number) => ({ ...t, fieldFlags: JSON.stringify(t.fieldFlags), uploadId });

export async function ingestZoho(db: PrismaClient, input: Readable | string, file: string, uploadId: number, names: NameBag) {
  const latest = new Map<string, TicketRecord>();
  const stats: FileStats = { file, read: 0, inserted: 0, updated: 0, skipped: 0, minDate: null, maxDate: null };
  const { rows } = await streamCsv(input, file, ZOHO_COLUMNS, (r) => {
    const t = parseZohoRow(r);
    if (!t) {
      stats.skipped++;
      return;
    }
    const prev = latest.get(t.requestId);
    if (prev) {
      stats.skipped++;
      if (t.modifiedTime <= prev.modifiedTime) return;
    }
    latest.set(t.requestId, t);
  });
  stats.read = rows;

  const all = [...latest.values()];
  for (const t of all) {
    span(stats, t.createdDate);
    span(stats, t.dueDate);
    if (t.creatorKey) names.add("Zoho", t.creatorKey, t.creatorRaw);
    if (t.ownerKey) names.add("Zoho", t.ownerKey, t.ownerRaw);
  }
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const existing = await db.ticket.findMany({
      where: { requestId: { in: chunk.map((t) => t.requestId) } },
      select: { requestId: true, modifiedTime: true },
    });
    const mod = new Map(existing.map((e) => [e.requestId, e.modifiedTime]));
    const inserts: TicketRecord[] = [];
    const updates: TicketRecord[] = [];
    for (const t of chunk) {
      const action = ticketAction(mod.get(t.requestId), t);
      if (action === "insert") inserts.push(t);
      else if (action === "update") updates.push(t);
      else stats.skipped++;
    }
    await db.$transaction([
      db.ticket.createMany({ data: inserts.map((t) => ticketData(t, uploadId)) }),
      ...updates.map((t) => db.ticket.update({ where: { requestId: t.requestId }, data: ticketData(t, uploadId) })),
    ]);
    stats.inserted += inserts.length;
    stats.updated += updates.length;
  }
  return stats;
}

export class NameBag {
  private names = new Map<string, { source: Source; key: string; raw: string }>();
  add(source: Source, key: string, raw: string) {
    const k = `${source}|${key}`;
    if (!this.names.has(k)) this.names.set(k, { source, key, raw });
  }
  list() {
    return [...this.names.values()];
  }
}

export interface UploadInput {
  dialer?: { name: string; input: Readable | string };
  zoho?: { name: string; input: Readable | string };
}

/** Runs a full upload: ingest both files, register new names, build the summary, write the upload log. */
export async function processUpload(db: PrismaClient, files: UploadInput, uploadedBy: string): Promise<{ summary: UploadSummary; logId: number }> {
  const log = await db.uploadLog.create({
    data: { uploadedBy, dialerFile: files.dialer?.name, zohoFile: files.zoho?.name, summary: "{}" },
  });
  const names = new NameBag();
  const summary: UploadSummary = { newNames: [], unconfirmedRows: 0, unattributedOutbound: 0, warnings: [] };
  if (!files.dialer || !files.zoho) summary.warnings.push(`Only the ${files.dialer ? "dialer call log" : "Zoho ticket export"} was uploaded. Metrics from the other file stay as they were.`);

  try {
    if (files.dialer) summary.dialer = await ingestDialer(db, files.dialer.input, files.dialer.name, log.id, names);
    if (files.zoho) summary.zoho = await ingestZoho(db, files.zoho.input, files.zoho.name, log.id, names);
  } catch (e) {
    await db.uploadLog.delete({ where: { id: log.id } });
    throw e;
  }

  const created = await registerNewNames(db, names.list());
  summary.newNames = created.map((c) => ({ source: c.source, rawName: c.rawName }));

  const mins = [summary.dialer?.minDate, summary.zoho?.minDate].filter(Boolean) as string[];
  const maxs = [summary.dialer?.maxDate, summary.zoho?.maxDate].filter(Boolean) as string[];
  if (mins.length) {
    const from = mins.sort()[0];
    const to = maxs.sort().at(-1)!;
    const m = await runMetrics(db, { from, to });
    summary.unconfirmedRows = m.unconfirmed.rows;
    summary.unattributedOutbound = m.unattributedOutbound;
  }
  await db.uploadLog.update({ where: { id: log.id }, data: { summary: JSON.stringify(summary) } });
  return { summary, logId: log.id };
}
