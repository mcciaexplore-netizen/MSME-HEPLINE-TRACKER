"use client";

import { useState, useTransition } from "react";
import type { Suggestion } from "@/lib/names";
import { saveMappings } from "../actions";

export interface MappingView {
  id: number;
  source: string;
  rawName: string;
  status: string;
  decision: string; // coordinator id | "IGNORE" | ""
  current: string;
  suggestions: Suggestion[];
  note: string | null;
  rows: number;
  confirmedBy: string | null;
  confirmedAt: string | null;
  history: { when: string; by: string; from: string; to: string }[];
}

type Coord = { id: number; name: string; active: boolean };

function DecisionSelect({ value, onChange, coordinators }: { value: string; onChange: (v: string) => void; coordinators: Coord[] }) {
  return (
    <select suppressHydrationWarning className="input w-full min-w-48" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {coordinators.map((c) => (
        <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</option>
      ))}
      <option value="IGNORE">Ignore (never count)</option>
    </select>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export function MappingEditor({ mappings, coordinators }: { mappings: MappingView[]; coordinators: Coord[] }) {
  const pending = mappings.filter((m) => m.status !== "Confirmed");
  const confirmed = mappings.filter((m) => m.status === "Confirmed");
  const [choices, setChoices] = useState<Record<number, string>>(() => Object.fromEntries(pending.map((m) => [m.id, m.decision])));
  const [selected, setSelected] = useState<Set<number>>(() => new Set(pending.filter((m) => m.decision).map((m) => m.id)));
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const [isPending, start] = useTransition();
  const [query, setQuery] = useState("");

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ready = [...selected].filter((id) => choices[id]);

  const confirmSelected = () => start(async () => {
    await saveMappings(ready.map((id) => ({ id, decision: choices[id] })));
    setSelected(new Set());
  });

  const shownConfirmed = confirmed.filter((m) => !query || `${m.rawName} ${m.current} ${m.source}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-base font-bold text-navy">Awaiting confirmation ({pending.length})</h2>
          {pending.length > 0 && (
            <button suppressHydrationWarning className="btn btn-primary" disabled={!ready.length || isPending} onClick={confirmSelected}>
              {isPending ? "Saving…" : `Confirm selected (${ready.length})`}
            </button>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Every name is confirmed. New names from future uploads will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-8">
                    <input suppressHydrationWarning type="checkbox" aria-label="Select all" checked={selected.size === pending.length} onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((m) => m.id)) : new Set())} />
                  </th>
                  <th style={{ textAlign: "left" }}>Raw name</th>
                  <th style={{ textAlign: "left" }}>Source</th>
                  <th>Rows</th>
                  <th style={{ textAlign: "left" }}>Suggestions (score)</th>
                  <th style={{ textAlign: "left" }}>Map to</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((m) => (
                  <tr key={m.id}>
                    <td><input suppressHydrationWarning type="checkbox" aria-label={`Select ${m.rawName}`} checked={selected.has(m.id)} onChange={() => toggle(m.id)} /></td>
                    <td style={{ textAlign: "left" }} className="font-semibold">{m.rawName}</td>
                    <td style={{ textAlign: "left" }}>{m.source}</td>
                    <td>{m.rows.toLocaleString("en-IN")}</td>
                    <td style={{ textAlign: "left", whiteSpace: "normal" }}>
                      <div className="flex flex-wrap gap-1">
                        {m.suggestions.map((s) => (
                          <button
                            key={s.coordinatorId}
                            className={`rounded-full border px-2 py-0.5 text-xs ${choices[m.id] === String(s.coordinatorId) ? "border-navy bg-navy text-white" : "border-line bg-white text-navy"}`}
                            onClick={() => { setChoices((c) => ({ ...c, [m.id]: String(s.coordinatorId) })); setSelected((x) => new Set(x).add(m.id)); }}
                          >
                            {s.fullName} {s.score.toFixed(2)}
                          </button>
                        ))}
                      </div>
                      {m.note && <p className="mt-1 max-w-sm text-xs text-orange-text">{m.note}</p>}
                    </td>
                    <td style={{ textAlign: "left" }}>
                      <DecisionSelect value={choices[m.id] ?? ""} coordinators={coordinators} onChange={(v) => { setChoices((c) => ({ ...c, [m.id]: v })); if (v) setSelected((x) => new Set(x).add(m.id)); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-base font-bold text-navy">Confirmed mappings ({confirmed.length})</h2>
          <input suppressHydrationWarning className="input" placeholder="Search names" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Raw name</th>
                <th style={{ textAlign: "left" }}>Source</th>
                <th>Rows</th>
                <th style={{ textAlign: "left" }}>Mapped to</th>
                <th style={{ textAlign: "left" }}>Confirmed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shownConfirmed.map((m) => (
                <FragmentRow key={m.id}>
                  <tr>
                    <td className="font-semibold">{m.rawName}</td>
                    <td style={{ textAlign: "left" }}>{m.source}</td>
                    <td>{m.rows.toLocaleString("en-IN")}</td>
                    <td style={{ textAlign: "left" }}>
                      {editing === m.id ? (
                        <DecisionSelect value={editValue} coordinators={coordinators} onChange={setEditValue} />
                      ) : (
                        <span className={m.current === "Ignore" ? "text-muted" : "text-navy"}>{m.current}</span>
                      )}
                    </td>
                    <td style={{ textAlign: "left" }} className="text-xs text-muted">{m.confirmedBy ?? ""}{m.confirmedAt ? `, ${fmt(m.confirmedAt)}` : ""}</td>
                    <td>
                      {editing === m.id ? (
                        <span className="inline-flex gap-2">
                          <button suppressHydrationWarning className="btn btn-primary" disabled={!editValue || isPending} onClick={() => start(async () => { await saveMappings([{ id: m.id, decision: editValue }]); setEditing(null); })}>Save</button>
                          <button suppressHydrationWarning className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-2">
                          <button suppressHydrationWarning className="btn btn-ghost" onClick={() => { setEditing(m.id); setEditValue(m.decision); }}>Edit</button>
                          <button suppressHydrationWarning className="btn btn-ghost" disabled={!m.history.length} onClick={() => setOpenHistory(openHistory === m.id ? null : m.id)}>History ({m.history.length})</button>
                        </span>
                      )}
                    </td>
                  </tr>
                  {openHistory === m.id && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "left", whiteSpace: "normal" }} className="bg-page">
                        <ul className="space-y-1 text-xs">
                          {m.history.map((h, i) => <li key={i}>{fmt(h.when)} · {h.by}: {h.from} → {h.to}</li>)}
                        </ul>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
