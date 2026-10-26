"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FileStats, UploadSummary } from "@/lib/ingest/store";

export function UploadForm() {
  const router = useRouter();
  const [dialer, setDialer] = useState<File | null>(null);
  const [zoho, setZoho] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<UploadSummary | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSummary(null);
    const fd = new FormData();
    if (dialer) fd.set("dialer", dialer);
    if (zoho) fd.set("zoho", zoho);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Upload failed.");
      else {
        setSummary(data.summary);
        router.refresh();
      }
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const onlyOne = (dialer ? 1 : 0) + (zoho ? 1 : 0) === 1;

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card grid gap-4 p-4 md:grid-cols-2">
        <FileInput label="Dialer call log" file={dialer} onChange={setDialer} />
        <FileInput label="Zoho ticket export" file={zoho} onChange={setZoho} />
        {onlyOne && (
          <p className="rounded-lg border border-[#f5c9a0] bg-[#fff6ec] px-3 py-2 text-sm text-[#7a3f06] md:col-span-2">
            Only one file is selected. You can upload it on its own, but the other file&apos;s numbers won&apos;t be refreshed.
          </p>
        )}
        {error && <p className="text-sm font-semibold text-red-700 md:col-span-2" role="alert">{error}</p>}
        <div className="md:col-span-2">
          <button suppressHydrationWarning className="btn btn-primary" disabled={busy || (!dialer && !zoho)}>{busy ? "Processing… this can take a minute" : "Upload and process"}</button>
        </div>
      </form>
      {summary && <Summary s={summary} />}
    </div>
  );
}

function FileInput({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input suppressHydrationWarning type="file" accept=".csv,text/csv" className="input mt-1 w-full" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {file && <span className="mt-1 block text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
    </label>
  );
}

function Stats({ title, s, extra }: { title: string; s: FileStats; extra?: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-heading text-sm font-bold text-navy">{title}</h3>
      <p className="text-xs text-muted">{s.file}</p>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
        {[["Read", s.read], ["Inserted", s.inserted], ["Updated", s.updated], ["Skipped", s.skipped]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-page py-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-heading font-bold text-navy">{Number(v).toLocaleString("en-IN")}</dd>
          </div>
        ))}
      </dl>
      {extra}
    </div>
  );
}

function Summary({ s }: { s: UploadSummary }) {
  return (
    <section className="card space-y-5 p-4">
      <h2 className="font-heading text-base font-bold text-navy">Upload summary</h2>
      {s.warnings.map((w) => <p key={w} className="text-sm text-[#7a3f06]">{w}</p>)}
      <div className="grid gap-5 md:grid-cols-2">
        {s.dialer && (
          <Stats title="Dialer call log" s={s.dialer} extra={<p className="mt-2 text-sm"><span className="font-semibold text-orange-text">{s.dialer.inboundNotReached}</span> inbound missed calls rang no coordinator.</p>} />
        )}
        {s.zoho && <Stats title="Zoho ticket export" s={s.zoho} />}
      </div>
      <div>
        <h3 className="font-heading text-sm font-bold text-navy">New names awaiting confirmation ({s.newNames.length})</h3>
        {s.newNames.length ? (
          <p className="mt-1 text-sm">
            {s.newNames.map((n) => `${n.rawName} (${n.source})`).join(", ")}.{" "}
            <Link href="/mapping" className="font-semibold text-navy underline">Confirm in Name mapping</Link>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">None.</p>
        )}
      </div>
      <ul className="space-y-1 text-sm">
        <li>
          <span className="font-semibold text-navy">{s.unconfirmedRows.toLocaleString("en-IN")}</span> rows in these dates are waiting on name confirmation and aren&apos;t counted yet.
        </li>
        <li>
          <span className="font-semibold text-navy">{s.unattributedOutbound.toLocaleString("en-IN")}</span> outbound calls had no agent name and can&apos;t be attributed to anyone.
        </li>
      </ul>
    </section>
  );
}
