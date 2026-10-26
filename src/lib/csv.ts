import type { Derived, MetricResult } from "./metrics";

export const CSV_COLUMNS = [
  "Date", "Coordinator",
  "Outbound Answered", "Outbound Missed", "Inbound Answered", "Inbound Missed", "Total Calls",
  "Conversation Outbound (min)", "Conversation Inbound (min)", "Conversation Total (min)", "Working Hours", "Avg Conversation Min per Working Hour", "Calls per Working Hour",
  "Meetings Scheduled", "Scheduling Ratio %",
  "Meetings Allotted", "Meetings Done", "Meetings Cancelled", "Meetings Rescheduled", "Meetings Pending",
  "Data Filled", "Data Remaining", "Execution Rate %", "Data Completion %",
  "Row Type", "Inbound Missed – Not Reached",
] as const;

const one = (v: number | null) => (v == null ? "" : v.toFixed(1));
const min = (sec: number) => (sec / 60).toFixed(1);

/** Quote when needed; neutralise spreadsheet formulas. */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Working hours are per coordinator (8 h per call day), so the team row leaves that cell blank. */
function metricCells(m: Derived, team = false): (string | number)[] {
  return [
    m.outboundAnswered, m.outboundMissed, m.inboundAnswered, m.inboundMissed, m.totalCalls,
    min(m.convOutSec), min(m.convInSec), min(m.convTotalSec), team ? "" : m.workingHours.toFixed(1), one(m.avgConvMinPerWorkingHour), one(m.callsPerWorkingHour),
    m.scheduled, one(m.schedulingRatio),
    m.allotted, m.done, m.cancelled, m.rescheduled, m.pending,
    m.dataFilled, m.dataRemaining, one(m.executionRate), one(m.dataCompletion),
  ];
}

export function buildCsv(result: MetricResult, names: Map<number, string>): string {
  const name = (id: number) => names.get(id) ?? `#${id}`;
  const lines: string[] = [CSV_COLUMNS.map(csvCell).join(",")];
  const push = (cells: (string | number)[]) => lines.push(cells.map(csvCell).join(","));
  const byName = (a: number, b: number) => name(a).localeCompare(name(b));

  const daily = [...result.daily].sort((a, b) => byName(a.coordinatorId, b.coordinatorId) || a.date.localeCompare(b.date));
  for (const d of daily) push([d.date, name(d.coordinatorId), ...metricCells(d.metrics), "Daily", ""]);
  for (const c of [...result.coordinators].sort((a, b) => byName(a.coordinatorId, b.coordinatorId))) {
    push(["", name(c.coordinatorId), ...metricCells(c.metrics), "Coordinator Total", ""]);
  }
  push(["", "Team", ...metricCells(result.team, true), "Team Total", result.inboundMissedNotReached]);
  return "﻿" + lines.join("\r\n") + "\r\n";
}
