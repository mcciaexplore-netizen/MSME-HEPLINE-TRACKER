import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CoordinatorEditor } from "./CoordinatorEditor";

export default async function CoordinatorsPage() {
  await requireAdmin();
  const coordinators = await prisma.coordinator.findMany({
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    include: { _count: { select: { mappings: true } } },
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy">Coordinators</h1>
        <p className="mt-1 text-sm text-muted">
          The full name is shown everywhere on the dashboard and in exports. Only active coordinators appear in the job form. The last name is used to suggest matches for new names in the files.
        </p>
      </div>
      <CoordinatorEditor coordinators={coordinators.map((c) => ({ id: c.id, fullName: c.fullName, lastName: c.lastName, status: c.status, mappings: c._count.mappings }))} />
    </div>
  );
}
