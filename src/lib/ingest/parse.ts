import Papa from "papaparse";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { CORE_FIELDS, EMPTY_PLACEHOLDERS, OPTIONAL_FIELDS, ZOHO_REQUIRED } from "../config";
import { dateOf, parseDuration, parseTimestamp } from "../dates";
import { cleanDialerName, cleanZohoName, nameKey, splitMissedAgents } from "../names";

export type Row = Record<string, string>;

export const cleanHeader = (h: string) => h.replace(/^﻿/, "").trim();

/** Header comparison key: case, spaces and punctuation don't matter ("Missed By Agent(s)" = "missed by agents"). */
const headerKey = (h: string) => cleanHeader(h).toLowerCase().replace(/[^a-z0-9]/g, "");

export type Aliases = Readonly<Record<string, readonly string[]>>;

/**
 * Maps each column we need to the file's actual header. With aliases, a column is found under any of its
 * accepted names (first match wins); without, the exact name is required.
 */
export function resolveColumns(headers: string[], required: readonly string[], aliases?: Aliases) {
  const byKey = new Map<string, string>();
  for (const h of headers) if (!byKey.has(headerKey(h))) byKey.set(headerKey(h), h);
  const columns = new Map<string, string>();
  const wanted = aliases ? Object.keys(aliases) : required;
  for (const col of wanted) {
    const names = aliases?.[col] ?? [col];
    const hit = aliases ? names.map((n) => byKey.get(headerKey(n))).find(Boolean) : headers.map(cleanHeader).find((h) => h === col);
    if (hit) columns.set(col, hit);
  }
  return { columns, missing: required.filter((r) => !columns.has(r)) };
}

export function missingColumns(headers: string[], required: readonly string[], aliases?: Aliases): string[] {
  return resolveColumns(headers, required, aliases).missing;
}

export class HeaderError extends Error {
  constructor(public file: string, public missing: string[], aliases?: Aliases) {
    const describe = (m: string) => {
      const others = (aliases?.[m] ?? []).filter((n) => n !== m);
      return others.length ? `${m} (also accepted: ${others.join(", ")})` : m;
    };
    super(`${file}: missing required column${missing.length > 1 ? "s" : ""}: ${missing.map(describe).join("; ")}`);
  }
}

/** Streams a CSV, validating headers before any row is processed. Only rows are held, never the whole file. */
export function streamCsv(
  input: Readable | string,
  file: string,
  required: readonly string[],
  onRow: (row: Row) => void,
  aliases?: Aliases,
): Promise<{ rows: number }> {
  return new Promise((resolve, reject) => {
    let checked = false;
    let rows = 0;
    let failed = false;
    let columns = new Map<string, string>();
    Papa.parse<Row>(input as never, {
      header: true,
      skipEmptyLines: true,
      transformHeader: cleanHeader,
      step: (res, parser) => {
        if (failed) return;
        if (!checked) {
          checked = true;
          const resolved = resolveColumns(res.meta.fields ?? [], required, aliases);
          if (resolved.missing.length) {
            failed = true;
            parser.abort();
            reject(new HeaderError(file, resolved.missing, aliases));
            return;
          }
          columns = resolved.columns;
        }
        rows++;
        try {
          // With aliases, hand rows over under our column names; otherwise pass them through.
          onRow(aliases ? Object.fromEntries([...columns].map(([col, header]) => [col, res.data[header] ?? ""])) : res.data);
        } catch (e) {
          failed = true;
          parser.abort();
          reject(e);
        }
      },
      complete: () => {
        if (failed) return;
        if (!checked) return reject(new HeaderError(file, [...required], aliases));
        resolve({ rows });
      },
      error: (err: Error) => reject(err),
    });
  });
}

export interface CallRecord {
  callId: string;
  direction: string;
  status: string;
  agentRaw: string;
  agentKey: string;
  missedRaw: string[];
  missedKeys: string[];
  startTime: string;
  startDate: string;
  convSeconds: number;
}

/** "inbound" / "ANSWERED" -> "Inbound" / "Answered" */
const titleCase = (s: string) => {
  const t = s.trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};

/**
 * Reads one dialer row (columns named as in DIALER_COLUMNS). Returns null when the time can't be read.
 * callId is "" when the sheet has no Call ID column; the uploader then derives one from the row.
 * Only these columns are ever read, so phone numbers and recording URLs are never stored.
 */
export function parseDialerRow(r: Row): CallRecord | null {
  const startTime = parseTimestamp(r["Time"]);
  if (!startTime) return null;
  const agentRaw = cleanDialerName(r["Answered By Agent"] ?? "");
  const missedRaw = splitMissedAgents(r["Missed By Agent"] ?? "");
  const status = titleCase(r["Status"] ?? "");
  return {
    callId: (r["Call ID"] ?? "").trim(),
    direction: titleCase(r["Direction"] ?? ""),
    status,
    agentRaw,
    agentKey: nameKey(agentRaw),
    missedRaw,
    missedKeys: missedRaw.map(nameKey),
    startTime,
    startDate: dateOf(startTime),
    convSeconds: status === "Answered" ? parseDuration(r["Conversation Duration"]) : 0,
  };
}

export interface TicketRecord {
  requestId: string;
  status: string;
  createdTime: string;
  createdDate: string;
  dueTime: string | null;
  dueDate: string | null;
  modifiedTime: string;
  creatorRaw: string;
  creatorKey: string;
  ownerRaw: string;
  ownerKey: string;
  fieldFlags: Record<string, boolean>;
}

export function isFilled(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length > 0 && !EMPTY_PLACEHOLDERS.includes(v.toLowerCase());
}

/** Only the columns we need are kept; field text is reduced to filled/empty flags. */
export function parseZohoRow(r: Row): TicketRecord | null {
  const requestId = (r["Request Id"] ?? "").trim();
  const createdTime = parseTimestamp(r["Created Time"]);
  if (!requestId || !createdTime) return null;
  const dueTime = parseTimestamp(r["Due Date"]);
  const creatorRaw = cleanZohoName(r["lastName(Created By)"] ?? "");
  const ownerRaw = cleanZohoName(r["lastName(Ticket Owner)"] ?? "");
  const fieldFlags: Record<string, boolean> = {};
  for (const f of [...CORE_FIELDS, ...OPTIONAL_FIELDS]) fieldFlags[f] = isFilled(r[f]);
  return {
    requestId,
    status: (r["Status"] ?? "").trim(),
    createdTime,
    createdDate: dateOf(createdTime),
    dueTime,
    dueDate: dueTime ? dateOf(dueTime) : null,
    modifiedTime: parseTimestamp(r["Modified Time"]) ?? createdTime,
    creatorRaw,
    creatorKey: nameKey(creatorRaw),
    ownerRaw,
    ownerKey: nameKey(ownerRaw),
    fieldFlags,
  };
}

export { DIALER_COLUMNS, DIALER_REQUIRED } from "../config";
export const ZOHO_COLUMNS = ZOHO_REQUIRED;

/**
 * Stable id for a call row without a Call ID: a hash of its fields plus how many identical rows came
 * before it in the same file, so re-uploading the same sheet matches the same rows instead of duplicating them.
 */
export function derivedCallId(c: CallRecord, occurrence: number): string {
  const basis = [c.direction, c.status, c.startTime, c.agentKey, c.missedKeys.join("|"), c.convSeconds].join("\u001f");
  return `row:${createHash("sha1").update(basis).digest("hex").slice(0, 20)}:${occurrence}`;
}

/** Upsert decision for a ticket: keep whichever version has the later Modified Time. */
export function ticketAction(existingModified: string | undefined, incoming: TicketRecord): "insert" | "update" | "skip" {
  if (existingModified === undefined) return "insert";
  return incoming.modifiedTime > existingModified ? "update" : "skip";
}

export function sameCall(a: CallRecord, b: CallRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
