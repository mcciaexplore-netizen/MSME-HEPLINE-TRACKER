import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nameKey, suggestCoordinator } from "./names";

// Checked against the real files: dialer name, Zoho last name, full name.
export const CONFIRMED = [
  ["Neha Agarwal", "Agrawal", "Neha Agarwal"],
  ["aarush majahan", "Mahajan", "Aarush Mahajan"],
  ["Samiksha bhosle", "Bhosale", "Samiksha Bhosle"],
  ["Siddharath Chavhan", "Chavan", "Siddharath Chavhan"],
  ["Rupesh Survase", "Surwase", "Rupesh Survase"],
] as const;

// Same last name in both files; loaded as Suggested for one-time confirmation.
export const SUGGESTED = [
  "Abhimanyu Rohal", "Aditi Gadgil", "Aishwary Songirkar", "Akshada Tekawade", "Dhananjay Patil",
  "Dhruti Alle", "Gautam Deshmukh", "Prachal Dandekar", "Purva Sahastrabuddhe", "Samiksha Bankar",
  "Shravani Ghod", "Smruti Kamble", "Vaidehi Tengshe", "Vedant Gore", "Vedant Savale",
] as const;

// Names that must never be counted: former staff and the shared "Helpline" account.
export const IGNORED: { source: "Dialer" | "Zoho"; raw: string }[] = [
  { source: "Dialer", raw: "Pooja Choudhary" },
  { source: "Dialer", raw: "Riya Belsare" },
  { source: "Zoho", raw: "Potdar" },
  { source: "Zoho", raw: "Deshpande" },
  { source: "Zoho", raw: "Tayade" },
  { source: "Zoho", raw: "Helpline" },
];

const lastWord = (s: string) => s.trim().split(/\s+/).at(-1)!;

export async function seed(db: PrismaClient, opts: { adminUser?: string; adminPassword?: string } = {}) {
  const user = opts.adminUser ?? process.env.ADMIN_USERNAME ?? "admin";
  const pass = opts.adminPassword ?? process.env.ADMIN_PASSWORD;
  if (pass) {
    const passwordHash = await bcrypt.hash(pass, 10);
    await db.adminUser.upsert({ where: { username: user }, update: { passwordHash }, create: { username: user, passwordHash } });
  }

  const all = [...CONFIRMED.map((c) => c[2]), ...SUGGESTED];
  for (const fullName of all) {
    await db.coordinator.upsert({ where: { fullName }, update: {}, create: { fullName, lastName: lastWord(fullName) } });
  }
  const coords = await db.coordinator.findMany();
  const byName = new Map(coords.map((c) => [c.fullName, c]));
  const now = new Date();

  const put = async (source: "Dialer" | "Zoho", raw: string, data: Record<string, unknown>) => {
    const key = nameKey(raw);
    const existing = await db.nameMapping.findUnique({ where: { source_key: { source, key } } });
    if (existing) return; // mappings are permanent; never overwrite an existing decision
    await db.nameMapping.create({ data: { source, key, rawName: raw, ...data } });
  };

  for (const [dialer, zoho, full] of CONFIRMED) {
    const c = byName.get(full)!;
    const confirmed = { status: "Confirmed", target: "COORDINATOR", coordinatorId: c.id, confirmedBy: "seed", confirmedAt: now };
    await put("Dialer", dialer, confirmed);
    await put("Zoho", zoho, confirmed);
  }
  for (const full of SUGGESTED) {
    const c = byName.get(full)!;
    for (const [source, raw] of [["Dialer", full], ["Zoho", lastWord(full)]] as const) {
      const match = suggestCoordinator(raw, source, coords);
      await put(source, raw, {
        status: "Suggested",
        target: "COORDINATOR",
        coordinatorId: c.id,
        suggestions: JSON.stringify(match.suggestions),
        note: match.note,
      });
    }
  }
  for (const { source, raw } of IGNORED) {
    await put(source, raw, { status: "Confirmed", target: "IGNORE", confirmedBy: "seed", confirmedAt: now });
  }
}
