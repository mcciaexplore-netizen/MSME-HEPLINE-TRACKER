"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const describe = (target: string | null, coordinatorName: string | null, status: string) =>
  `${status}: ${target === "IGNORE" ? "Ignore" : coordinatorName ?? "(none)"}`;

/** Confirm or change one or more mappings. decision = coordinator id, or "IGNORE". */
export async function saveMappings(items: { id: number; decision: string }[]) {
  const admin = await requireAdmin();
  const coords = new Map((await prisma.coordinator.findMany()).map((c) => [c.id, c.fullName]));
  for (const { id, decision } of items) {
    const ignore = decision === "IGNORE";
    const coordinatorId = ignore ? null : Number(decision);
    if (!ignore && !coords.has(coordinatorId!)) continue;
    const m = await prisma.nameMapping.findUnique({ where: { id }, include: { coordinator: true } });
    if (!m) continue;
    const oldValue = describe(m.target, m.coordinator?.fullName ?? null, m.status);
    const newValue = describe(ignore ? "IGNORE" : "COORDINATOR", coordinatorId ? coords.get(coordinatorId)! : null, "Confirmed");
    if (oldValue === newValue) continue;
    await prisma.$transaction([
      prisma.nameMapping.update({
        where: { id },
        data: { target: ignore ? "IGNORE" : "COORDINATOR", coordinatorId, status: "Confirmed", confirmedBy: admin, confirmedAt: new Date() },
      }),
      prisma.mappingChange.create({ data: { mappingId: id, oldValue, newValue, changedBy: admin } }),
    ]);
  }
  revalidatePath("/", "layout");
}

const lastWord = (s: string) => s.trim().split(/\s+/).at(-1) ?? "";

export async function addCoordinator(form: FormData) {
  await requireAdmin();
  const fullName = String(form.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) return { error: "Enter a full name." };
  if (await prisma.coordinator.findUnique({ where: { fullName } })) return { error: `${fullName} already exists.` };
  const lastName = String(form.get("lastName") ?? "").trim() || lastWord(fullName);
  await prisma.coordinator.create({ data: { fullName, lastName } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateCoordinator(id: number, data: { fullName: string; lastName: string; status: string }) {
  await requireAdmin();
  const fullName = data.fullName.replace(/\s+/g, " ").trim();
  if (!fullName) return { error: "Enter a full name." };
  const clash = await prisma.coordinator.findUnique({ where: { fullName } });
  if (clash && clash.id !== id) return { error: `${fullName} already exists.` };
  await prisma.coordinator.update({
    where: { id },
    data: { fullName, lastName: data.lastName.trim() || lastWord(fullName), status: data.status === "Inactive" ? "Inactive" : "Active" },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
