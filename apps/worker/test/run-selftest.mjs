// Runs test/selftest.ts inside the worker image. Build the image first:
//   docker build -f apps/worker/Dockerfile -t texpr-worker .
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));

execFileSync(
  "npx",
  ["esbuild", "test/selftest.ts", "--bundle", "--platform=node", "--target=node22", "--format=esm", "--outfile=test/.dist/selftest.mjs"],
  { cwd: path.dirname(testDir), stdio: "inherit", shell: process.platform === "win32" },
);
execFileSync("docker", ["run", "--rm", "-v", `${testDir}:/test:ro`, "texpr-worker", "node", "/test/.dist/selftest.mjs"], {
  stdio: "inherit",
});
