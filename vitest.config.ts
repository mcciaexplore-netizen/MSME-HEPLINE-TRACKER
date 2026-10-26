import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Tests wipe their database, so they run against TEST_DATABASE_URL (from .env), never DATABASE_URL.
const fileEnv = loadEnv("test", process.cwd(), "");
const testDb = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
if (!testDb) throw new Error("Set TEST_DATABASE_URL in .env to a Postgres database the tests may wipe");
if (testDb === (process.env.DATABASE_URL ?? fileEnv.DATABASE_URL)) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["./tests/globalSetup.ts"],
    env: {
      DATABASE_URL: testDb,
      SESSION_SECRET: "test-secret-test-secret-123",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "test-pass",
    },
    fileParallelism: false,
  },
});
