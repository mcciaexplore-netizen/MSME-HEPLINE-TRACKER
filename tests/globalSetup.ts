import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Fresh throwaway database for every test run (TEST_DATABASE_URL is only ever used by tests).
export default function setup(project: TestProject) {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: project.config.env.DATABASE_URL },
    stdio: "ignore",
  });
}
