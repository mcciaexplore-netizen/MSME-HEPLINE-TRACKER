import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** For server components: redirects to /login when there is no valid admin session. */
export async function requireAdmin(): Promise<string> {
  const store = await cookies();
  const user = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: returns the admin username, or a 403 response. */
export async function adminFromRequest(req: NextRequest): Promise<string | NextResponse> {
  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return user ?? NextResponse.json({ error: "Admin session required" }, { status: 403 });
}
