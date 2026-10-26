import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// Fresh throwaway database for every test run (prisma/test.db is only ever used by tests).
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) rmSync(path.resolve(__dirname, "../prisma", f), { force: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
