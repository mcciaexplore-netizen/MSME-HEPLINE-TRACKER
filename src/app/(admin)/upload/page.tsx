import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { UploadSummary } from "@/lib/ingest/store";
import { UploadForm } from "./UploadForm";

export default async function UploadPage() {
  await requireAdmin();
  const logs = await prisma.uploadLog.findMany({ orderBy: { uploadedAt: "desc" }, take: 20 });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Upload</h1>
        <p className="mt-1 text-sm text-muted">Upload the day&apos;s dialer call log and Zoho ticket export (CSV). Re-uploading a file is safe: existing calls and tickets are matched, not duplicated.</p>
        <p className="mt-1 text-sm text-muted">
          Dialer columns used: <strong>Direction</strong>, <strong>Status</strong>, <strong>Time</strong>, <strong>Answered By Agent</strong>, <strong>Missed By Agent</strong>, <strong>Conversation Duration</strong> (Call ID optional). The full export&apos;s names (Call Status, Call Start Time, Missed By Agent(s)) also work.
        </p>
      </div>
      <UploadForm />
      <section className="card p-4">
        <h2 className="mb-3 font-heading text-base font-bold text-navy">Upload log</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">No uploads yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr><th>When</th><th>By</th><th>Dialer file</th><th>Zoho file</th><th>Calls new / updated</th><th>Tickets new / updated</th><th>New names</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const s = JSON.parse(l.summary) as Partial<UploadSummary>;
                  return (
                    <tr key={l.id}>
                      <td>{l.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                      <td>{l.uploadedBy}</td>
                      <td>{l.dialerFile ?? "–"}</td>
                      <td>{l.zohoFile ?? "–"}</td>
                      <td>{s.dialer ? `${s.dialer.inserted} / ${s.dialer.updated}` : "–"}</td>
                      <td>{s.zoho ? `${s.zoho.inserted} / ${s.zoho.updated}` : "–"}</td>
                      <td>{s.newNames?.length ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
