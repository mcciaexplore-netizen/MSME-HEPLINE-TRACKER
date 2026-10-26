import { describe, expect, it } from "vitest";
import { CORE_FIELDS } from "@/lib/config";
import { formatHM, workingHoursRule } from "@/lib/metrics";
import { AARUSH, NEHA, allFilled, call, of, run, ticket } from "./fixtures";

describe("overall performance (no job rule)", () => {
  it("counts everything a coordinator did: 20 allotted (10 done, 5 cancelled, 5 rescheduled), 5 scheduled, plus calls", () => {
    const tickets = [
      ...Array.from({ length: 10 }, () => ticket({ status: "Done", dueDate: "2026-10-20", creatorKey: "mahajan" })),
      ...Array.from({ length: 5 }, () => ticket({ status: "Cancelled", dueDate: "2026-10-20", creatorKey: "mahajan" })),
      ...Array.from({ length: 5 }, () => ticket({ status: "Rescheduled", dueDate: "2026-10-20", creatorKey: "mahajan" })),
      ...Array.from({ length: 5 }, () => ticket({ createdDate: "2026-10-20", ownerKey: "mahajan", dueDate: "2026-10-30" })),
    ];
    const m = of(run([call({ date: "2026-10-20" }), call({ date: "2026-10-20", status: "Missed" })], tickets), NEHA);
    expect(m).toMatchObject({ allotted: 20, done: 10, cancelled: 5, rescheduled: 5, scheduled: 5, totalCalls: 2 });
    expect(m.executionRate).toBe(50);
  });

  it("a coordinator with only calls and one with only meetings both count fully on the same day", () => {
    const r = run([call({ date: "2026-10-20" })], [ticket({ ownerKey: "mahajan", creatorKey: "mahajan", dueDate: "2026-10-20", status: "Done" })]);
    expect(of(r, NEHA)).toMatchObject({ totalCalls: 1, allotted: 0 });
    expect(of(r, AARUSH)).toMatchObject({ totalCalls: 0, allotted: 1, done: 1 });
  });
});

describe("calls", () => {
  it("counts outbound answered and missed by Answered By Agent", () => {
    const m = of(run([call({ convSeconds: 120 }), call({ status: "Missed" }), call({ status: "Missed" })], []), NEHA);
    expect(m).toMatchObject({ outboundAnswered: 1, outboundMissed: 2, convOutSec: 120, totalCalls: 3 });
  });

  it("counts an inbound answered call and its conversation time", () => {
    const m = of(run([call({ direction: "Inbound", convSeconds: 300 })], []), NEHA);
    expect(m).toMatchObject({ inboundAnswered: 1, convInSec: 300, convTotalSec: 300 });
  });

  it("an inbound missed call that rang 2 coordinators counts once for each but once in the team total", () => {
    const r = run([call({ direction: "Inbound", status: "Missed", agentKey: "", missedKeys: ["neha agarwal", "aarush majahan"] })], []);
    expect(of(r, NEHA).inboundMissed).toBe(1);
    expect(of(r, AARUSH).inboundMissed).toBe(1);
    expect(r.team.inboundMissed).toBe(1);
    expect(r.team.totalCalls).toBe(1);
  });

  it("an inbound missed call that rang nobody is a team-level figure only", () => {
    const r = run([call({ direction: "Inbound", status: "Missed", agentKey: "", missedKeys: [] })], []);
    expect(r.inboundMissedNotReached).toBe(1);
    expect(r.team.inboundMissed).toBe(0);
  });

  it("outbound calls with a blank agent are never attributed", () => {
    const r = run([call({ agentKey: "", status: "Missed" })], []);
    expect(r.team.totalCalls).toBe(0);
    expect(r.unattributedOutbound).toBe(1);
  });

  it("working hours = a fixed 8-hour shift (10 am–6 pm) for each day with an outbound or answered inbound call", () => {
    const r = run([call({ time: "10:00:00" }), call({ time: "13:30:00", direction: "Inbound" }), call({ date: "2026-10-21", time: "09:00:00" })], []);
    expect(of(r, NEHA).workingHours).toBe(16);
    expect(workingHoursRule([600])).toBe(8);
    expect(workingHoursRule([])).toBe(0);
  });

  it("a day where calls only rang the coordinator (inbound missed) is not a working day", () => {
    const m = of(run([call({ direction: "Inbound", status: "Missed", agentKey: "", missedKeys: ["neha agarwal"] })], []), NEHA);
    expect(m).toMatchObject({ inboundMissed: 1, callDays: 0, workingHours: 0 });
    expect(m.callsPerDay).toBeNull();
  });

  it("calls per day = (outbound answered + outbound missed + inbound answered) / call days, excluding inbound missed", () => {
    const m = of(
      run([
        call({ convSeconds: 1800 }),
        call({ status: "Missed" }),
        call({ direction: "Inbound" }),
        call({ direction: "Inbound", status: "Missed", agentKey: "", missedKeys: ["neha agarwal"] }),
        call({ date: "2026-10-21" }),
      ], []),
      NEHA,
    );
    expect(m.totalCalls).toBe(5);
    expect(m.handledCalls).toBe(4);
    expect(m.callDays).toBe(2);
    expect(m.callsPerDay).toBe(2);
    expect(m.avgConvMinPerWorkingHour).toBeCloseTo(30 / 16); // 30 min over 2 shifts of 8 h
    expect(m.callsPerWorkingHour).toBe(4 / 16);
  });

  it("calls per working hour uses each coordinator's own 8-hour shift; the team figure is the average coordinator", () => {
    const r = run([
      ...Array.from({ length: 80 }, () => call({})),
      ...Array.from({ length: 40 }, () => call({ agentKey: "aarush majahan" })),
    ], []);
    expect(of(r, NEHA).callsPerWorkingHour).toBe(10); // 80 calls / 8 h
    expect(of(r, AARUSH).callsPerWorkingHour).toBe(5); // 40 calls / 8 h
    expect(r.team.callsPerWorkingHour).toBe(7.5); // (80 + 40) / (8 + 8), not 120 / 8
  });

  it("team conversation per working hour counts half the coordinators on calls (the other half run meetings)", () => {
    const r = run([call({ convSeconds: 60 * 60 }), call({ agentKey: "aarush majahan", convSeconds: 30 * 60 })], []);
    expect(of(r, NEHA).avgConvMinPerWorkingHour).toBe(60 / 8); // each coordinator keeps their own 8 h
    expect(of(r, AARUSH).avgConvMinPerWorkingHour).toBe(30 / 8);
    expect(r.team.avgConvMinPerWorkingHour).toBe(90 / 8); // 90 min / (2 coordinators × 0.5 × 8 h)
  });

  it("team calls per day = team calls / all coordinators' call days", () => {
    const r = run([call({}), call({}), call({ agentKey: "aarush majahan" }), call({ agentKey: "aarush majahan", date: "2026-10-21" })], []);
    expect(r.team.callDays).toBe(3);
    expect(r.team.callsPerDay).toBeCloseTo(4 / 3);
  });
});

describe("scheduling", () => {
  it("meetings scheduled by Created By on Created Time; ratio uses outbound answered", () => {
    const m = of(run([call({}), call({}), call({}), call({ status: "Missed" })], [ticket({ createdDate: "2026-10-20" })]), NEHA);
    expect(m.scheduled).toBe(1);
    expect(m.schedulingRatio).toBeCloseTo(33.33, 1);
  });
});

describe("execution", () => {
  it("a rescheduled meeting that changes owner: original counts as Rescheduled for its owner, new ticket as allotted for the new owner", () => {
    const r = run([], [ticket({ status: "Rescheduled", ownerKey: "agrawal", dueDate: "2026-10-20" }), ticket({ status: "Done", ownerKey: "mahajan", dueDate: "2026-10-22", fieldFlags: allFilled() })]);
    expect(of(r, NEHA)).toMatchObject({ allotted: 1, rescheduled: 1, done: 0 });
    expect(of(r, AARUSH)).toMatchObject({ allotted: 1, done: 1, dataFilled: 1 });
  });

  it("a rescheduled meeting that keeps the same owner counts as two allotted meetings", () => {
    const m = of(run([], [ticket({ status: "Rescheduled", dueDate: "2026-10-20" }), ticket({ status: "Pending", dueDate: "2026-10-21" })]), NEHA);
    expect(m).toMatchObject({ allotted: 2, rescheduled: 1, pending: 1 });
  });

  it("excludes blank due dates and due dates after today", () => {
    const m = of(run([], [ticket({ dueDate: null }), ticket({ dueDate: "2026-10-24" }), ticket({ dueDate: "2026-10-23" })], { to: "2026-10-31" }), NEHA);
    expect(m.allotted).toBe(1);
  });

  it("a Done ticket missing one core field is not data filled", () => {
    const flags = allFilled();
    flags[CORE_FIELDS[3]] = false;
    const m = of(run([], [ticket({ status: "Done", fieldFlags: flags }), ticket({ status: "Done", fieldFlags: allFilled() })]), NEHA);
    expect(m).toMatchObject({ done: 2, dataFilled: 1, dataRemaining: 1, dataCompletion: 50 });
  });

  it("the Helpline owner is never counted", () => {
    const r = run([], [ticket({ ownerKey: "helpline", creatorKey: "helpline", status: "Done" })]);
    expect(r.team.allotted).toBe(0);
    expect(r.team.scheduled).toBe(0);
    expect(r.unconfirmed.rows).toBe(0);
  });

  it("status counts reconcile with allotted", () => {
    const m = of(run([], ["Done", "Cancelled", "Rescheduled", "Pending"].map((status) => ticket({ status }))), NEHA);
    expect(m.done + m.cancelled + m.rescheduled + m.pending).toBe(m.allotted);
    expect(m.executionRate).toBe(25);
  });

  it("rows from unconfirmed names are not counted", () => {
    const r = run([call({ agentKey: "someone new" })], [ticket({ ownerKey: "newname" })]);
    expect(r.team.totalCalls + r.team.allotted).toBe(0);
    expect(r.unconfirmed.rows).toBe(2);
  });
});

describe("zero denominators", () => {
  it("rates are null (shown as –) when the denominator is zero", () => {
    const m = of(run([], []), NEHA);
    expect(m.callsPerDay).toBeNull();
    expect(m.schedulingRatio).toBeNull();
    expect(m.executionRate).toBeNull();
    expect(m.dataCompletion).toBeNull();
    expect(m.avgConvMinPerWorkingHour).toBeNull();
  });

  it("team percentages are recomputed from summed counts", () => {
    const r = run([call({}), call({ agentKey: "aarush majahan" }), call({ agentKey: "aarush majahan" }), call({ agentKey: "aarush majahan" })], [ticket({ creatorKey: "agrawal" })]);
    expect(of(r, NEHA).schedulingRatio).toBe(100);
    expect(of(r, AARUSH).schedulingRatio).toBe(0);
    expect(r.team.schedulingRatio).toBe(25); // not the average (50)
  });

  it("formats durations as Xh YYm", () => {
    expect(formatHM(229872)).toBe("63h 51m");
  });
});
