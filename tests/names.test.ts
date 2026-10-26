import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registerNewNames, runMetrics } from "@/lib/data";
import { buildResolver, cleanDialerName, splitMissedAgents, suggestCoordinator } from "@/lib/names";
import { seed } from "@/lib/seedData";

const coords = [
  { id: 1, fullName: "Akshada Tekawade", lastName: "Tekawade" },
  { id: 2, fullName: "Neha Agarwal", lastName: "Agarwal" },
  { id: 3, fullName: "Shravani Ghod", lastName: "Ghod" },
];

describe("name cleaning and matching", () => {
  it("strips numbers, plus signs, -Extension and extra spaces", () => {
    expect(cleanDialerName("Neha Agarwal (+919028014361)")).toBe("Neha Agarwal");
    expect(cleanDialerName("Gautam  Deshmukh-Extension (+91...)")).toBe("Gautam Deshmukh");
    expect(splitMissedAgents("aarush+majahan (+917965815936), Siddharath+Chavhan (+919423990606)")).toEqual(["aarush majahan", "Siddharath Chavhan"]);
  });

  it("pre-selects a clear match", () => {
    expect(suggestCoordinator("Agrawal", "Zoho", coords).preselectId).toBe(2);
    expect(suggestCoordinator("shravani ghod", "Dialer", coords).preselectId).toBe(3);
  });

  it("does not pre-select Tekawade for Tayade (score 0.84)", () => {
    const m = suggestCoordinator("Tayade", "Zoho", coords);
    expect(m.suggestions[0]).toMatchObject({ fullName: "Akshada Tekawade", score: 0.838 });
    expect(m.preselectId).toBeNull();
    expect(m.suggestions).toHaveLength(3);
  });

  it("never pre-selects when two active coordinators share the last name", () => {
    const m = suggestCoordinator("Patil", "Zoho", [
      { id: 7, fullName: "Dhananjay Patil", lastName: "Patil" },
      { id: 8, fullName: "Archana Patil", lastName: "Patil" },
    ]);
    expect(m.preselectId).toBeNull();
    expect(m.note).toMatch(/share the last name/);
  });

  it("only confirmed mappings resolve", () => {
    const resolve = buildResolver([
      { source: "Zoho", key: "agrawal", status: "Confirmed", target: "COORDINATOR", coordinatorId: 2 },
      { source: "Zoho", key: "ghod", status: "Suggested", target: "COORDINATOR", coordinatorId: 3 },
      { source: "Zoho", key: "helpline", status: "Confirmed", target: "IGNORE", coordinatorId: null },
    ]);
    expect(resolve("Zoho", "agrawal")).toBe(2);
    expect(resolve("Zoho", "ghod")).toBeNull();
    expect(resolve("Zoho", "helpline")).toBe("IGNORE");
  });
});

describe("name mapping (database)", () => {
  const db = new PrismaClient();
  const day = "2026-09-10";
  beforeAll(async () => {
    await seed(db);
  });
  afterAll(() => db.$disconnect());

  it("a confirmed mapping is reused without re-matching", async () => {
    const before = await db.nameMapping.findUniqueOrThrow({ where: { source_key: { source: "Zoho", key: "agrawal" } } });
    const created = await registerNewNames(db, [{ source: "Zoho", key: "agrawal", raw: "Agrawal" }]);
    expect(created).toHaveLength(0);
    const after = await db.nameMapping.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
  });

  it("a new name gets a suggestion but its rows are not counted until confirmed, then past rows count", async () => {
    const ghod = await db.coordinator.findUniqueOrThrow({ where: { fullName: "Shravani Ghod" } });
    const [created] = await registerNewNames(db, [{ source: "Dialer", key: "shravani g ghod", raw: "Shravani G Ghod" }]);
    expect(created.status).toBe("Suggested");
    expect(created.coordinatorId).toBe(ghod.id);

    await db.call.create({ data: { callId: "NM-1", direction: "Outbound", status: "Answered", agentRaw: "Shravani G Ghod", agentKey: "shravani g ghod", startTime: `${day} 11:00:00`, startDate: day, convSeconds: 30 } });

    const pending = await runMetrics(db, { from: day, to: day });
    expect(pending.unconfirmed.rows).toBe(1);
    expect(pending.team.totalCalls).toBe(0);

    await db.nameMapping.update({ where: { id: created.id }, data: { status: "Confirmed", target: "COORDINATOR" } });
    const confirmed = await runMetrics(db, { from: day, to: day });
    expect(confirmed.unconfirmed.rows).toBe(0);
    expect(confirmed.coordinators.find((c) => c.coordinatorId === ghod.id)!.metrics.outboundAnswered).toBe(1);
  });

  it("an admin edit re-attributes all rows for that raw name", async () => {
    const gore = await db.coordinator.findUniqueOrThrow({ where: { fullName: "Vedant Gore" } });
    await db.nameMapping.update({ where: { source_key: { source: "Dialer", key: "shravani g ghod" } }, data: { coordinatorId: gore.id } });
    const r = await runMetrics(db, { from: day, to: day });
    expect(r.coordinators.find((c) => c.coordinatorId === gore.id)!.metrics.outboundAnswered).toBe(1);
  });
});
