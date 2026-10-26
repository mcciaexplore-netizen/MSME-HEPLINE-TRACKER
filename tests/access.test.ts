import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { middleware } from "@/middleware";
import { GET as exportGet } from "@/app/api/export/route";
import { POST as uploadPost } from "@/app/api/upload/route";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "@/lib/session";
import { seed } from "@/lib/seedData";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

describe("access control", () => {
  const db = new PrismaClient();
  beforeAll(() => seed(db));
  afterAll(() => db.$disconnect());

  it.each(["/", "/dashboard", "/coordinators", "/mapping", "/upload"])("%s redirects to /login without an admin session", async (path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });

  it("admin API endpoints return 403 without a session (middleware and handler)", async () => {
    expect((await middleware(req("/api/export"))).status).toBe(403);
    expect((await exportGet(req("/api/export"))).status).toBe(403);
    expect((await uploadPost(req("/api/upload"))).status).toBe(403);
  });

  it("rejects tampered and expired tokens", async () => {
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token)).toBe("admin");
    expect(await verifySessionToken(token.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBeNull();
    expect(await verifySessionToken(await createSessionToken("admin", Date.now() - 13 * 3600 * 1000))).toBeNull();
    expect((await middleware(req("/dashboard", "forged.token"))).status).toBe(307);
  });

  it("lets a valid session through and exports a CSV", async () => {
    const token = await createSessionToken("admin");
    expect((await middleware(req("/dashboard", token))).status).toBe(200);
    expect((await middleware(req("/login", token))).headers.get("location")).toMatch(/\/dashboard$/);
    const res = await exportGet(req("/api/export?period=custom&from=2026-10-17&to=2026-10-23", token));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("msme-helpline-performance_2026-10-17_2026-10-23.csv");
    expect(await db.exportLog.count()).toBeGreaterThan(0);
  });

  it("only the login page is public", async () => {
    expect((await middleware(req("/login"))).status).toBe(200);
    expect((await middleware(req("/job"))).status).toBe(307);
  });
});
