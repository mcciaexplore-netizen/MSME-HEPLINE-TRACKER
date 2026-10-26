import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}));
  const user = typeof username === "string" ? await prisma.adminUser.findUnique({ where: { username } }) : null;
  const ok = user && typeof password === "string" && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user.username), sessionCookieOptions);
  return res;
}
