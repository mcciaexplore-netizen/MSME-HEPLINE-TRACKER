import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isPublicPath, verifySessionToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" && (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (isPublicPath(pathname)) return NextResponse.next();
  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Admin session required" }, { status: 403 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
