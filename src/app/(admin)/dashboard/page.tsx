import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { rowCountFor, runMetrics } from "@/lib/data";
import { formatDisplayDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { formatHM, formatNum1, formatPct } from "@/lib/metrics";
import { FilterBar } from "@/components/FilterBar";
import { OutputChart } from "@/components/OutputChart";
import { CallsTable, ExecutionTable, OverallTable, type TableRow } from "@/components/CoordinatorTables";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const filters = parseFilters(await searchParams);
  const [result, lastUpload, pending, coordinators] = await Promise.all([
    runMetrics(prisma, { from: filters.from, to: filters.to, coordinatorId: filters.coordinatorId }),
    prisma.uploadLog.findFirst({ orderBy: { uploadedAt: "desc" } }),
    prisma.nameMapping.findMany({ where: { status: "Suggested" } }),
    prisma.coordinator.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true, status: true } }),
  ]);
  const pendingRows = (await Promise.all(pending.map((p) => rowCountFor(prisma, p.source, p.key)))).reduce((a, b) => a + b, 0);
  const t = result.team;

  const rows: TableRow[] = result.coordinators.map((c) => ({ id: c.coordinatorId, name: result.coordinatorNames.get(c.coordinatorId) ?? "", ...c.metrics }));
  const query = filtersToQuery(filters);
  const range = filters.from === filters.to ? formatDisplayDate(filters.from) : `${formatDisplayDate(filters.from)} – ${formatDisplayDate(filters.to)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Performance Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {range} · {rows.length} coordinator{rows.length === 1 ? "" : "s"} · Last updated:{" "}
            {lastUpload ? lastUpload.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "no uploads yet"}
          </p>
        </div>
        <a href={`/api/export?${query}`} className="btn btn-primary">
          <DownloadIcon /> Export CSV
        </a>
      </div>

      {pending.length > 0 && (
        <Banner tone="orange">
          <strong>{pending.length} name{pending.length === 1 ? "" : "s"} awaiting confirmation, {pendingRows.toLocaleString("en-IN")} rows not yet counted.</strong>{" "}
          <Link href="/mapping" className="font-semibold underline">Review in Name mapping</Link>
        </Banner>
      )}

      <FilterBar filters={filters} coordinators={coordinators.map((c) => ({ id: c.id, name: c.fullName }))} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total calls" value={t.totalCalls.toLocaleString("en-IN")} sub={`${formatNum1(t.callsPerDay)} calls per day (excl. inbound missed)`} />
        <StatCard label="Meetings scheduled" value={t.scheduled.toLocaleString("en-IN")} sub={`${formatPct(t.schedulingRatio)} scheduling ratio`} />
        <StatCard label="Meetings done" value={t.done.toLocaleString("en-IN")} sub={`${formatPct(t.executionRate)} of ${t.allotted.toLocaleString("en-IN")} allotted`} />
        <StatCard label="Data completion" value={formatPct(t.dataCompletion)} sub={`${t.dataRemaining.toLocaleString("en-IN")} done meetings still need data`} />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="label">Calls</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Pair k="Outbound (answered / missed)" v={`${t.outboundAnswered.toLocaleString("en-IN")} / ${t.outboundMissed.toLocaleString("en-IN")}`} />
            <Pair k="Inbound (answered / missed)" v={`${t.inboundAnswered.toLocaleString("en-IN")} / ${t.inboundMissed.toLocaleString("en-IN")}`} />
            <Pair k="Total calls" v={t.totalCalls.toLocaleString("en-IN")} />
            <Pair k="Calls per day (out. answered + out. missed + in. answered)" v={formatNum1(t.callsPerDay)} />
            <Pair k="Conversation outbound / inbound" v={`${formatHM(t.convOutSec)} / ${formatHM(t.convInSec)}`} />
            <Pair k="Conversation total" v={formatHM(t.convTotalSec)} />
            <Pair k="Working hours" v="8 h per coordinator (10 am–6 pm)" />
            <Pair k="Calls per working hour (avg per coordinator)" v={formatNum1(t.callsPerWorkingHour)} />
            <Pair k="Conversation per working hour (talk time ÷ half the coordinators on calls × 8 h)" v={t.avgConvMinPerWorkingHour == null ? "–" : `${t.avgConvMinPerWorkingHour.toFixed(1)} min`} />
          </dl>
          <div className="mt-3 rounded-lg bg-[#fff6ec] px-3 py-2 text-sm">
            <span className="text-orange-text font-semibold">{result.inboundMissedNotReached.toLocaleString("en-IN")}</span>{" "}
            <span className="text-muted">inbound missed – not reached any coordinator (team-level)</span>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="label">Scheduling</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Pair k="Meetings scheduled" v={t.scheduled.toLocaleString("en-IN")} />
            <Pair k="Scheduling ratio" v={formatPct(t.schedulingRatio)} />
            <Pair k="Outbound answered" v={t.outboundAnswered.toLocaleString("en-IN")} />
          </dl>
        </div>
        <div className="card p-4">
          <h2 className="label">Execution</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Pair k="Allotted" v={t.allotted} />
            <Pair k="Done" v={t.done} />
            <Pair k="Cancelled" v={t.cancelled} />
            <Pair k="Rescheduled" v={t.rescheduled} />
            <Pair k="Pending" v={t.pending} />
            <Pair k="Data filled" v={t.dataFilled} />
            <Pair k="Data remaining" v={t.dataRemaining} />
            <Pair k="Execution rate" v={formatPct(t.executionRate)} />
            <Pair k="Data completion" v={formatPct(t.dataCompletion)} />
          </dl>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-heading text-base font-bold text-navy">Overall performance by coordinator</h2>
        <p className="mb-3 mt-1 text-sm text-muted">Everything each person did in the period: calls they made or took, meetings they scheduled (ticket creator) and meetings allotted to them (ticket owner, due in the period).</p>
        <OverallTable rows={rows} team={{ id: 0, name: "Team total", ...t }} />
      </section>

      <section className="card p-4">
        <h2 className="font-heading text-base font-bold text-navy">Output by employee</h2>
        <OutputChart data={rows.filter((r) => r.scheduled || r.done).map((r) => ({ name: r.name, scheduled: r.scheduled, done: r.done }))} />
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-heading text-base font-bold text-navy">Calls &amp; scheduling by coordinator</h2>
        <CallsTable rows={rows} team={{ id: 0, name: "Team total", ...t }} />
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-heading text-base font-bold text-navy">Execution by coordinator</h2>
        <ExecutionTable rows={rows} team={{ id: 0, name: "Team total", ...t }} />
      </section>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card border-t-4 border-t-orange p-4">
      <div className="label">{label}</div>
      <div className="mt-1 font-heading text-3xl font-bold text-navy">{value}</div>
      <div className="mt-1 text-sm text-muted">{sub}</div>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="font-heading font-semibold text-navy tabular-nums">{v}</dd>
    </div>
  );
}

function Banner({ children }: { tone: "orange"; children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-[#f5c9a0] bg-[#fff6ec] px-4 py-3 text-sm text-[#7a3f06]">{children}</div>;
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
