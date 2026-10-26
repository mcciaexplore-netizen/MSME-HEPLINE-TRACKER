import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Readable } from "node:stream";
import Papa from "papaparse";
import { CORE_FIELDS, ZOHO_REQUIRED } from "@/lib/config";
import { HeaderError, parseDialerRow, parseZohoRow } from "@/lib/ingest/parse";
import { processUpload } from "@/lib/ingest/store";
import { runMetrics } from "@/lib/data";
import { seed } from "@/lib/seedData";

const toCsv = (rows: Record<string, string>[], fields: readonly string[]) => Papa.unparse({ fields: [...fields], data: rows.map((r) => fields.map((f) => r[f] ?? "")) });

// Full dialer export header names (the uploader also accepts the short names: Status, Time, Missed By Agent).
const EXPORT_FIELDS = ["Call ID", "Direction", "Call Status", "Answered By Agent", "Missed By Agent(s)", "Call Start Time", "Conversation Duration", "Recording"];
const SIMPLE_FIELDS = ["Direction", "Status", "Time", "Answered By Agent", "Missed By Agent", "Conversation Duration"];

const dialerRows: Record<string, string>[] = [
  { "Call ID": "U-1", Direction: "Outbound", "Call Status": "Answered", "Answered By Agent": "Neha Agarwal (+919028014361)", "Call Start Time": "2026-08-05 10:00:00", "Conversation Duration": "00:02:00" },
  { "Call ID": "U-2", Direction: "Inbound", "Call Status": "Missed", "Missed By Agent(s)": "aarush+majahan (+917965815936)", "Call Start Time": "05-08-2026 11:15", "Conversation Duration": "00:00:00" },
  { "Call ID": "U-3", Direction: "Inbound", "Call Status": "Missed", "Call Start Time": "2026-08-05 12:00:00", "Conversation Duration": "00:00:00", Recording: "https://x/?token=secret" },
];
const zohoRow = (status: string, modified: string, extra: Record<string, string> = {}) => ({
  "Request Id": "Z-1", Status: status, "Created Time": "2026-08-04 10:00:00", "Due Date": "2026-08-05 15:00:00",
  "Modified Time": modified, "lastName(Created By)": "Agrawal", "lastName(Ticket Owner)": "Mahajan", ...extra,
});

describe("parsing", () => {
  it("accepts both date formats and normalises Direction/Status case", () => {
    const c = parseDialerRow({ Direction: "inbound", Status: "MISSED", Time: "05-08-2026 11:15", "Missed By Agent": "aarush+majahan (+91...)" })!;
    expect(c).toMatchObject({ startTime: "2026-08-05 11:15:00", direction: "Inbound", status: "Missed", missedKeys: ["aarush majahan"], callId: "" });
  });

  it("treats Zoho's 'None' placeholder and whitespace as empty", () => {
    const t = parseZohoRow(zohoRow("Done", "2026-08-05 16:00:00", { "Meeting Query": "  ", "Rate the solution/ recommendation": "None", "Meeting Solution": "ok" }) as never)!;
    expect(t.fieldFlags["Meeting Query"]).toBe(false);
    expect(t.fieldFlags["Rate the solution/ recommendation"]).toBe(false);
    expect(t.fieldFlags["Meeting Solution"]).toBe(true);
  });
});

describe("upload (database)", () => {
  const db = new PrismaClient();
  beforeAll(() => seed(db));
  afterAll(() => db.$disconnect());

  it("rejects a file with a missing column and names it", async () => {
    const fields = EXPORT_FIELDS.filter((f) => f !== "Call Status");
    const err = await processUpload(db, { dialer: { name: "d.csv", input: toCsv(dialerRows, fields) } }, "admin").catch((e) => e);
    expect(err).toBeInstanceOf(HeaderError);
    expect(err.message).toContain("Status (also accepted: Call Status)");
  });

  it("inserts once, re-uploading the same files inserts nothing new", async () => {
    const files = () => ({
      dialer: { name: "d.csv", input: Readable.from([toCsv(dialerRows, EXPORT_FIELDS)]) },
      zoho: { name: "z.csv", input: Readable.from([toCsv([zohoRow("Pending", "2026-08-04 10:00:00")], ZOHO_REQUIRED)]) },
    });
    const first = await processUpload(db, files(), "admin");
    expect(first.summary.dialer).toMatchObject({ read: 3, inserted: 3, updated: 0 });
    expect(first.summary.dialer!.inboundNotReached).toBe(1);
    expect(first.summary.zoho).toMatchObject({ read: 1, inserted: 1 });
    expect(first.summary.unconfirmedRows).toBe(0);

    const second = await processUpload(db, files(), "admin");
    expect(second.summary.dialer).toMatchObject({ inserted: 0, updated: 0, skipped: 3 });
    expect(second.summary.zoho).toMatchObject({ inserted: 0, updated: 0, skipped: 1 });
    expect(await db.uploadLog.count()).toBe(2);
  });

  it("never stores recording URLs", async () => {
    expect(JSON.stringify(await db.call.findMany())).not.toContain("secret");
  });

  it("accepts the short sheet (Direction, Status, Time, Answered/Missed By Agent, Conversation Duration) without a Call ID", async () => {
    const rows = [
      { Direction: "Outbound", Status: "Answered", Time: "06-08-2026 10:00", "Answered By Agent": "Neha Agarwal (+91...)", "Missed By Agent": "", "Conversation Duration": "00:03:00" },
      { Direction: "Outbound", Status: "Missed", Time: "06-08-2026 10:05", "Answered By Agent": "Neha Agarwal (+91...)", "Missed By Agent": "", "Conversation Duration": "00:00:00" },
      // two identical rows (same minute, same agent) are two separate calls
      { Direction: "Outbound", Status: "Missed", Time: "06-08-2026 10:05", "Answered By Agent": "Neha Agarwal (+91...)", "Missed By Agent": "", "Conversation Duration": "00:00:00" },
      { Direction: "Inbound", Status: "Missed", Time: "06-08-2026 11:00", "Answered By Agent": "", "Missed By Agent": "aarush+majahan (+91...), Neha+Agarwal (+91...)", "Conversation Duration": "00:00:00" },
    ];
    const upload = () => processUpload(db, { dialer: { name: "simple.csv", input: toCsv(rows, SIMPLE_FIELDS) } }, "admin");
    expect((await upload()).summary.dialer).toMatchObject({ read: 4, inserted: 4, skipped: 0 });
    expect((await upload()).summary.dialer).toMatchObject({ read: 4, inserted: 0, skipped: 4 });
    const m = await runMetrics(db, { from: "2026-08-06", to: "2026-08-06" });
    const neha = m.coordinators.find((c) => m.coordinatorNames.get(c.coordinatorId) === "Neha Agarwal")!.metrics;
    expect(neha).toMatchObject({ outboundAnswered: 1, outboundMissed: 2, inboundMissed: 1, convOutSec: 180 });
    expect(m.team.inboundMissed).toBe(1);
  });

  it("a ticket with a later Modified Time replaces the earlier one (matched by Request Id); an older one does not", async () => {
    const filled = Object.fromEntries(CORE_FIELDS.map((f) => [f, "x"]));
    const later = await processUpload(db, { zoho: { name: "z2.csv", input: toCsv([zohoRow("Done", "2026-08-06 09:00:00", filled)], ZOHO_REQUIRED) } }, "admin");
    expect(later.summary.zoho).toMatchObject({ inserted: 0, updated: 1 });
    expect(later.summary.warnings[0]).toMatch(/Only the Zoho/);
    const older = await processUpload(db, { zoho: { name: "z3.csv", input: toCsv([zohoRow("Cancelled", "2026-08-05 09:00:00")], ZOHO_REQUIRED) } }, "admin");
    expect(older.summary.zoho).toMatchObject({ updated: 0, skipped: 1 });
    expect((await db.ticket.findUniqueOrThrow({ where: { requestId: "Z-1" } })).status).toBe("Done");
  });
});
