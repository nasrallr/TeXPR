import os from "node:os";
import path from "node:path";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return n;
}

const dataDir = process.env.DATA_DIR ?? path.join(os.tmpdir(), "texpr");

export const config = {
  port: int("PORT", 8080),
  /** Shared secret the web app sends as `Authorization: Bearer …`. Required in production. */
  secret: process.env.WORKER_SECRET ?? "",
  production: process.env.NODE_ENV === "production",

  jobsDir: path.join(dataDir, "jobs"),
  cacheDir: path.join(dataDir, "cache"),

  /** Compiles run as this user when the server runs as root (always, in the Docker image). */
  sandboxUid: int("SANDBOX_UID", 10001),
  sandboxGid: int("SANDBOX_GID", 10001),

  maxConcurrentJobs: int("MAX_JOBS", 2),
  /** Requests waiting beyond this many get 503 instead of queueing forever. */
  maxQueuedJobs: int("MAX_QUEUED_JOBS", 8),
  compileTimeoutMs: int("COMPILE_TIMEOUT_MS", 90_000),
  latexdiffTimeoutMs: int("LATEXDIFF_TIMEOUT_MS", 60_000),
  maxTarballBytes: int("MAX_TARBALL_BYTES", 100 * 1024 * 1024),
  maxExtractedBytes: int("MAX_EXTRACTED_BYTES", 500 * 1024 * 1024),
};
