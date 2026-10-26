import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { CSV_COLUMNS, buildCsv, csvCell } from "@/lib/csv";
import { AARUSH, NEHA, call, run, ticket } from "./fixtures";

describe("CSV export", () => {
  const r = run(
    [call({ convSeconds: 90 }), call({ direction: "Inbound", status: "Missed", agentKey: "", missedKeys: ["neha agarwal", "aarush majahan"] }), call({ direction: "Inbound", status: "Missed", agentKey: "", missedKeys: [] })],
    [ticket({ createdDate: "2026-10-20", status: "Done" })],
  );
  const csv = buildCsv(r, new Map([[NEHA, "Neha Agarwal"], [AARUSH, "=Aarush, \"A\""]]));
  const parsed = Papa.parse<string[]>(csv.slice(1)).data.filter((l) => l.length > 1);

  it("starts with a UTF-8 BOM and the columns in order", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parsed[0]).toEqual([...CSV_COLUMNS]);
  });

  it("has one row per coordinator per day, then coordinator totals, then a team total", () => {
    const types = parsed.slice(1).map((l) => l[24]);
    expect(types.filter((t) => t === "Daily")).toHaveLength(2 * 7);
    expect(types.filter((t) => t === "Coordinator Total")).toHaveLength(2);
    expect(types.at(-1)).toBe("Team Total");
  });

  it("writes plain numbers: 1-decimal percentages and minutes, blanks for zero denominators", () => {
    const neha = parsed.find((l) => l[1] === "Neha Agarwal" && l[24] === "Coordinator Total")!;
    expect(neha[7]).toBe("1.5"); // conversation outbound minutes
    expect(neha[14]).toBe("100.0"); // scheduling ratio
    expect(neha[23]).toBe("0.0"); // data completion: 0 of 1 done
    const aarush = parsed.find((l) => l[24] === "Coordinator Total" && l[1] !== "Neha Agarwal")!;
    expect(aarush[14]).toBe(""); // no outbound answered
    const team = parsed.at(-1)!;
    expect(team[5]).toBe("1"); // inbound missed counted once for the team
    expect(team[25]).toBe("1"); // not reached
  });

  it("escapes quotes and commas and neutralises formulas", () => {
    expect(csvCell('=SUM(A1), "x"')).toBe(`"'=SUM(A1), ""x"""`);
    expect(csvCell("+91")).toBe("'+91");
    expect(csvCell("@x")).toBe("'@x");
    expect(parsed.some((l) => l[1] === `'=Aarush, "A"`)).toBe(true);
  });
});
