"use client";

import { useMemo, useState } from "react";
import type { Derived } from "@/lib/metrics";
import { formatHM, formatNum1, formatPct } from "@/lib/metrics";

export type TableRow = Derived & { id: number; name: string };

interface Column {
  key: string;
  label: string;
  value: (r: TableRow) => number | string | null;
  render?: (r: TableRow) => React.ReactNode;
}

function RateBar({ value, color }: { value: number | null; color: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#eef1f6] sm:inline-block">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, value ?? 0)}%`, background: color }} />
      </span>
      <span className="w-12 text-right">{formatPct(value)}</span>
    </span>
  );
}

function SortableTable({ rows, team, columns, initial }: { rows: TableRow[]; team: TableRow; columns: Column[]; initial: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initial, dir: -1 });
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)!;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va === vb) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : 1) * sort.dir;
    });
  }, [rows, columns, sort]);

  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No coordinator activity in this period.</p>;

  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button
                  className="font-semibold hover:text-navy"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "name" ? 1 : -1 }))}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : c.value(r)}</td>)}
            </tr>
          ))}
          <tr className="total">
            {columns.map((c) => <td key={c.key}>{c.render ? c.render(team) : c.value(team)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const CALL_COLUMNS: Column[] = [
  { key: "name", label: "Coordinator", value: (r) => r.name },
  { key: "oa", label: "Out. answered", value: (r) => r.outboundAnswered },
  { key: "om", label: "Out. missed", value: (r) => r.outboundMissed },
  { key: "ia", label: "In. answered", value: (r) => r.inboundAnswered },
  { key: "im", label: "In. missed", value: (r) => r.inboundMissed },
  { key: "total", label: "Total", value: (r) => r.totalCalls },
  { key: "cpd", label: "Calls/day", value: (r) => r.callsPerDay, render: (r) => formatNum1(r.callsPerDay) },
  { key: "cph", label: "Calls/work hr", value: (r) => r.callsPerWorkingHour, render: (r) => formatNum1(r.callsPerWorkingHour) },
  { key: "conv", label: "Conversation", value: (r) => r.convTotalSec, render: (r) => formatHM(r.convTotalSec) },
  { key: "cwh", label: "Conv./work hr", value: (r) => r.avgConvMinPerWorkingHour, render: (r) => (r.avgConvMinPerWorkingHour == null ? "–" : `${r.avgConvMinPerWorkingHour.toFixed(1)} min`) },
  { key: "sched", label: "Scheduled", value: (r) => r.scheduled },
  { key: "ratio", label: "Sched. ratio", value: (r) => r.schedulingRatio, render: (r) => <RateBar value={r.schedulingRatio} color="#f08a24" /> },
];

const EXEC_COLUMNS: Column[] = [
  { key: "name", label: "Coordinator", value: (r) => r.name },
  { key: "allotted", label: "Allotted", value: (r) => r.allotted },
  { key: "done", label: "Done", value: (r) => r.done },
  { key: "cancelled", label: "Cancelled", value: (r) => r.cancelled },
  { key: "rescheduled", label: "Rescheduled", value: (r) => r.rescheduled },
  { key: "pending", label: "Pending", value: (r) => r.pending },
  { key: "filled", label: "Data filled", value: (r) => r.dataFilled },
  { key: "remaining", label: "Data remaining", value: (r) => r.dataRemaining },
  { key: "exec", label: "Execution rate", value: (r) => r.executionRate, render: (r) => <RateBar value={r.executionRate} color="#1b3a7a" /> },
  { key: "compl", label: "Data completion", value: (r) => r.dataCompletion, render: (r) => <RateBar value={r.dataCompletion} color="#f08a24" /> },
];

const OVERALL_COLUMNS: Column[] = [
  { key: "name", label: "Coordinator", value: (r) => r.name },
  { key: "total", label: "Calls", value: (r) => r.totalCalls },
  { key: "cph", label: "Calls/work hr", value: (r) => r.callsPerWorkingHour, render: (r) => formatNum1(r.callsPerWorkingHour) },
  { key: "conv", label: "Conversation", value: (r) => r.convTotalSec, render: (r) => formatHM(r.convTotalSec) },
  { key: "sched", label: "Scheduled", value: (r) => r.scheduled },
  { key: "allotted", label: "Allotted", value: (r) => r.allotted },
  { key: "done", label: "Done", value: (r) => r.done },
  { key: "cancelled", label: "Cancelled", value: (r) => r.cancelled },
  { key: "rescheduled", label: "Rescheduled", value: (r) => r.rescheduled },
  { key: "pending", label: "Pending", value: (r) => r.pending },
  { key: "filled", label: "Data filled", value: (r) => r.dataFilled },
  { key: "exec", label: "Done / allotted", value: (r) => r.executionRate, render: (r) => <RateBar value={r.executionRate} color="#1b3a7a" /> },
];

/** One row per coordinator with everything they did, regardless of what kind of work it was. */
export function OverallTable({ rows, team }: { rows: TableRow[]; team: TableRow }) {
  return <SortableTable rows={rows} team={team} columns={OVERALL_COLUMNS} initial="allotted" />;
}

export function CallsTable({ rows, team }: { rows: TableRow[]; team: TableRow }) {
  return <SortableTable rows={rows} team={team} columns={CALL_COLUMNS} initial="sched" />;
}

export function ExecutionTable({ rows, team }: { rows: TableRow[]; team: TableRow }) {
  return <SortableTable rows={rows} team={team} columns={EXEC_COLUMNS} initial="allotted" />;
}
