import { requireAdmin } from "@/lib/auth";
import { rowCountFor } from "@/lib/data";
import { prisma } from "@/lib/db";
import type { Suggestion } from "@/lib/names";
import { MappingEditor, type MappingView } from "./MappingEditor";

export default async function MappingPage() {
  await requireAdmin();
  const [mappings, coordinators] = await Promise.all([
    prisma.nameMapping.findMany({ include: { coordinator: true, changes: { orderBy: { changedAt: "desc" } } }, orderBy: [{ source: "asc" }, { rawName: "asc" }] }),
    prisma.coordinator.findMany({ orderBy: { fullName: "asc" } }),
  ]);
  const views: MappingView[] = await Promise.all(
    mappings.map(async (m) => ({
      id: m.id,
      source: m.source,
      rawName: m.rawName,
      status: m.status,
      decision: m.target === "IGNORE" ? "IGNORE" : m.coordinatorId ? String(m.coordinatorId) : "",
      current: m.target === "IGNORE" ? "Ignore" : m.coordinator?.fullName ?? "",
      suggestions: JSON.parse(m.suggestions) as Suggestion[],
      note: m.note,
      rows: await rowCountFor(prisma, m.source, m.key),
      confirmedBy: m.confirmedBy,
      confirmedAt: m.confirmedAt?.toISOString() ?? null,
      history: m.changes.map((c) => ({ when: c.changedAt.toISOString(), by: c.changedBy, from: c.oldValue, to: c.newValue })),
    })),
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Name mapping</h1>
        <p className="mt-1 text-sm text-muted">
          Each raw name from the dialer or Zoho is linked to a coordinator once. Rows for names awaiting confirmation are stored but not counted. Changing a mapping re-attributes every row for that name, including past dates.
        </p>
      </div>
      <MappingEditor mappings={views} coordinators={coordinators.map((c) => ({ id: c.id, name: c.fullName, active: c.status === "Active" }))} />
    </div>
  );
}
