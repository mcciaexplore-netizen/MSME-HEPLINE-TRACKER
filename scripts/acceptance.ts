// Acceptance check (spec section 12). Usage:
//   npx tsx scripts/acceptance.ts <dialer.csv> <zoho.csv> [from] [to]
// Wipes and uses the test database (TEST_DATABASE_URL in .env), never the app database.
import { execSync } from "node:child_process";
import { createReadStream } from "node:fs";
import path from "node:path";

const [dialer, zoho, from = "2026-10-17", to = "2026-10-23"] = process.argv.slice(2);
if (!dialer || !zoho) {
  console.error("Usage: npx tsx scripts/acceptance.ts <dialer.csv> <zoho.csv> [from] [to]");
  process.exit(1);
}

try {
  process.loadEnvFile(path.resolve(__dirname, "../.env"));
} catch {}
if (!process.env.TEST_DATABASE_URL) {
  console.error("Set TEST_DATABASE_URL in .env to a Postgres database this script may wipe.");
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
execSync("npx prisma db push --force-reset --skip-generate", { env: process.env, stdio: "ignore" });

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { seed } = await import("../src/lib/seedData");
  const { processUpload } = await import("../src/lib/ingest/store");
  const { runMetrics } = await import("../src/lib/data");
  const { formatHM, formatPct } = await import("../src/lib/metrics");

  const db = new PrismaClient();
  await seed(db, { adminPassword: "x" });
  await db.nameMapping.updateMany({ where: { status: "Suggested", coordinatorId: { not: null } }, data: { status: "Confirmed" } });

  const { summary } = await processUpload(
    db,
    { dialer: { name: path.basename(dialer), input: createReadStream(dialer) }, zoho: { name: path.basename(zoho), input: createReadStream(zoho) } },
    "acceptance",
  );
  console.log("Dialer:", summary.dialer, "\nZoho:", summary.zoho);
  console.log("New names awaiting confirmation:", summary.newNames.map((n) => `${n.rawName} (${n.source})`).join(", ") || "none");

  const r = await runMetrics(db, { from, to });
  const t = r.team;
  const perCoordMisses = r.coordinators.reduce((a, c) => a + c.metrics.inboundMissed, 0);
  console.log(`\n=== Team, ${from} to ${to} ===`);
  console.log(`Outbound: ${t.outboundAnswered + t.outboundMissed} calls, ${t.outboundAnswered} answered, ${t.outboundMissed} missed, ${formatHM(t.convOutSec)} conversation`);
  console.log(`Inbound answered: ${t.inboundAnswered} (${formatHM(t.convInSec)})`);
  console.log(`Inbound missed: ${t.inboundMissed} calls rang a coordinator (${perCoordMisses} per-coordinator misses); ${r.inboundMissedNotReached} reached no coordinator`);
  console.log(`Unattributed outbound (blank agent): ${r.unattributedOutbound}`);
  console.log(`Meetings scheduled: ${t.scheduled}; scheduling ratio ${formatPct(t.schedulingRatio)}`);
  console.log(`Execution: ${t.allotted} allotted, ${t.done} done, ${t.cancelled} cancelled, ${t.rescheduled} rescheduled, ${t.pending} pending; data completion ${formatPct(t.dataCompletion)}, execution rate ${formatPct(t.executionRate)}`);
  console.log(`Rows from unconfirmed names: ${r.unconfirmed.rows}`);

  console.log(`\n=== By coordinator ===`);
  for (const c of [...r.coordinators].sort((a, b) => b.metrics.allotted - a.metrics.allotted)) {
    const m = c.metrics;
    if (!m.totalCalls && !m.scheduled && !m.allotted) continue;
    console.log(`${(r.coordinatorNames.get(c.coordinatorId) ?? "").padEnd(22)} calls ${String(m.totalCalls).padStart(5)}  scheduled ${String(m.scheduled).padStart(3)}  allotted ${String(m.allotted).padStart(3)}  done ${String(m.done).padStart(3)}  cancelled ${String(m.cancelled).padStart(3)}  rescheduled ${String(m.rescheduled).padStart(3)}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
