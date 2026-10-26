"use client";

import { useState, useTransition } from "react";
import { addCoordinator, updateCoordinator } from "../actions";

type C = { id: number; fullName: string; lastName: string; status: string; mappings: number };

export function CoordinatorEditor({ coordinators }: { coordinators: C[] }) {
  const [editing, setEditing] = useState<C | null>(null);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();

  const add = (form: FormData) =>
    start(async () => {
      const r = await addCoordinator(form);
      setError("error" in r && r.error ? r.error : "");
    });

  const save = () =>
    start(async () => {
      if (!editing) return;
      const r = await updateCoordinator(editing.id, editing);
      if ("error" in r && r.error) setError(r.error);
      else {
        setError("");
        setEditing(null);
      }
    });

  const toggle = (c: C) => start(async () => { await updateCoordinator(c.id, { ...c, status: c.status === "Active" ? "Inactive" : "Active" }); });

  return (
    <div className="space-y-5">
      <form action={add} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="label">Full name</span>
          <input suppressHydrationWarning name="fullName" className="input" required placeholder="e.g. Neha Agarwal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Last name (for matching)</span>
          <input suppressHydrationWarning name="lastName" className="input" placeholder="Defaults to the last word" />
        </label>
        <button suppressHydrationWarning className="btn btn-primary" disabled={isPending}>Add coordinator</button>
        {error && <p className="w-full text-sm font-semibold text-red-700" role="alert">{error}</p>}
      </form>

      <section className="card overflow-x-auto p-4">
        <table className="data">
          <thead>
            <tr>
              <th>Full name</th>
              <th style={{ textAlign: "left" }}>Last name</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th>Mapped names</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coordinators.map((c) =>
              editing?.id === c.id ? (
                <tr key={c.id}>
                  <td><input suppressHydrationWarning className="input w-full" value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} /></td>
                  <td style={{ textAlign: "left" }}><input suppressHydrationWarning className="input" value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} /></td>
                  <td style={{ textAlign: "left" }}>{c.status}</td>
                  <td>{c.mappings}</td>
                  <td>
                    <span className="inline-flex gap-2">
                      <button suppressHydrationWarning className="btn btn-primary" onClick={save} disabled={isPending}>Save</button>
                      <button suppressHydrationWarning className="btn btn-ghost" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={c.status === "Active" ? "" : "text-muted"}>
                  <td className="font-semibold">{c.fullName}</td>
                  <td style={{ textAlign: "left" }}>{c.lastName}</td>
                  <td style={{ textAlign: "left" }}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.status === "Active" ? "bg-green-50 text-green-800" : "bg-gray-100 text-muted"}`}>{c.status}</span>
                  </td>
                  <td>{c.mappings}</td>
                  <td>
                    <span className="inline-flex gap-2">
                      <button suppressHydrationWarning className="btn btn-ghost" onClick={() => setEditing(c)}>Edit</button>
                      <button suppressHydrationWarning className="btn btn-ghost" onClick={() => toggle(c)} disabled={isPending}>{c.status === "Active" ? "Deactivate" : "Reactivate"}</button>
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
