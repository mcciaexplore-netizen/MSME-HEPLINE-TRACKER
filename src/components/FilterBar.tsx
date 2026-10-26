"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Filters } from "@/lib/filters";

const PERIODS = [
  { v: "today", l: "Today" },
  { v: "yesterday", l: "Yesterday" },
  { v: "last7", l: "Last 7 days" },
  { v: "month", l: "This month" },
  { v: "custom", l: "Custom range" },
];

export function FilterBar({ filters, coordinators }: { filters: Filters; coordinators: { id: number; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);

  function go(patch: Record<string, string | null>) {
    const q = new URLSearchParams({ period: filters.period });
    if (filters.period === "custom") {
      q.set("from", filters.from);
      q.set("to", filters.to);
    }
    if (filters.coordinatorId) q.set("coordinator", String(filters.coordinatorId));
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    if (q.get("period") !== "custom") {
      q.delete("from");
      q.delete("to");
    }
    router.push(`${path}?${q.toString()}`);
  }

  return (
    <div className="card flex flex-wrap items-end gap-3 p-3">
      <label className="flex flex-col gap-1">
        <span className="label">Period</span>
        <select suppressHydrationWarning className="input" value={filters.period} onChange={(e) => go({ period: e.target.value, ...(e.target.value === "custom" ? { from, to } : {}) })}>
          {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
      </label>
      {filters.period === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="label">From</span>
            <input suppressHydrationWarning type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">To</span>
            <input suppressHydrationWarning type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button suppressHydrationWarning className="btn btn-ghost" onClick={() => go({ period: "custom", from, to })}>Apply</button>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="label">Coordinator</span>
        <select suppressHydrationWarning className="input" value={filters.coordinatorId ?? ""} onChange={(e) => go({ coordinator: e.target.value || null })}>
          <option value="">All coordinators</option>
          {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </div>
  );
}
