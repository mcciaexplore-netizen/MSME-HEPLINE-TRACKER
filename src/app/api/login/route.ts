import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

// Slows password guessing: after MAX_FAILURES wrong sign-ins from one address, it waits out the window.
// Keyed by address, not username, so someone guessing can't lock the real admin out.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const since = new Date(Date.now() - WINDOW_MS);
  await prisma.loginFailure.deleteMany({ where: { at: { lt: since } } });
  if ((await prisma.loginFailure.count({ where: { ip, at: { gte: since } } })) >= MAX_FAILURES) {
    return NextResponse.json({ error: "Too many failed sign-ins. Try again in 15 minutes." }, { status: 429 });
  }

  const { username, password } = await req.json().catch(() => ({}));
  const user = typeof username === "string" ? await prisma.adminUser.findUnique({ where: { username } }) : null;
  const ok = user && typeof password === "string" && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    await prisma.loginFailure.create({ data: { ip } });
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }
  await prisma.loginFailure.deleteMany({ where: { ip } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user.username), sessionCookieOptions);
  return res;
}
