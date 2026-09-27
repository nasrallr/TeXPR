import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { RepoRevision, WorkerError } from "@texpr/shared";
import { config } from "./config.js";
import { JobError } from "./errors.js";
import { assertCanRead, downloadTarball } from "./github.js";
import { assertMainFile, compile, extractTarball, latexdiff, type Engine } from "./latex.js";
import { makeSandboxDir, sandboxFor, type Sandbox } from "./sandbox.js";

/** Bump when compile behaviour changes, so old cached PDFs are ignored. */
const CACHE_VERSION = 1;

export interface Artifact {
  pdfPath: string;
  engine: Engine;
  hadErrors: boolean;
  cache: "hit" | "miss";
}

interface CacheMeta {
  engine: Engine;
  hadErrors: boolean;
}

export async function buildPdf(rev: RepoRevision, mainFile: string, token: string | undefined): Promise<Artifact> {
  await assertCanRead(rev, token);
  const key = cacheKey(["build", ...revKey(rev), mainFile]);
  return cachedOrRun(key, (jobDir, sandbox) => runBuild(jobDir, sandbox, rev, mainFile, token));
}

export async function diffPdf(
  base: RepoRevision,
  head: RepoRevision,
  mainFile: string,
  token: string | undefined,
): Promise<Artifact> {
  await Promise.all([assertCanRead(base, token), assertCanRead(head, token)]);
  const key = cacheKey(["diff", ...revKey(base), ...revKey(head), mainFile]);
  return cachedOrRun(key, (jobDir, sandbox) => runDiff(jobDir, sandbox, base, head, mainFile, token));
}

async function runBuild(jobDir: string, sandbox: Sandbox, rev: RepoRevision, mainFile: string, token: string | undefined) {
  const src = path.join(jobDir, "src");
  await checkout(rev, token, src, sandbox);
  assertMainFile(src, mainFile);
  return compile(src, mainFile, sandbox);
}

async function runDiff(
  jobDir: string,
  sandbox: Sandbox,
  base: RepoRevision,
  head: RepoRevision,
  mainFile: string,
  token: string | undefined,
) {
  const baseDir = path.join(jobDir, "base");
  const headDir = path.join(jobDir, "head");
  await Promise.all([checkout(base, token, baseDir, sandbox), checkout(head, token, headDir, sandbox)]);
  assertMainFile(baseDir, mainFile);
  assertMainFile(headDir, mainFile);
  const diffFile = await latexdiff(jobDir, baseDir, headDir, mainFile, sandbox);
  return compile(headDir, diffFile, sandbox);
}

async function checkout(rev: RepoRevision, token: string | undefined, dest: string, sandbox: Sandbox) {
  const tarball = `${dest}.tar.gz`;
  await downloadTarball(rev, token, tarball);
  makeSandboxDir(dest, sandbox);
  try {
    await extractTarball(tarball, dest, sandbox);
  } finally {
    fs.rmSync(tarball, { force: true });
  }
}

// --- cache, de-duplication, concurrency ------------------------------------

const inflight = new Map<string, Promise<Artifact>>();

async function cachedOrRun(
  key: string,
  work: (jobDir: string, sandbox: Sandbox) => Promise<{ pdfPath: string; engine: Engine; hadErrors: boolean }>,
): Promise<Artifact> {
  const hit = readCache(key);
  if (hit) return hit;

  // Two people opening the same PR at once share one compile.
  const running = inflight.get(key);
  if (running) return running;

  const promise = withSlot(async (slot) => {
    const jobDir = path.join(config.jobsDir, crypto.randomUUID());
    const sandbox = sandboxFor(slot, path.join(jobDir, "home"));
    makeSandboxDir(jobDir, sandbox);
    makeSandboxDir(sandbox.home, sandbox);
    try {
      const result = await work(jobDir, sandbox);
      return writeCache(key, result.pdfPath, { engine: result.engine, hadErrors: result.hadErrors });
    } catch (err) {
      // A compile failure is deterministic for a given commit, so remember it.
      if (err instanceof JobError && err.code === "compile_failed") writeFailure(key, err);
      throw err;
    } finally {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
  }).finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

function readCache(key: string): Artifact | undefined {
  const failure = path.join(config.cacheDir, `${key}.error.json`);
  if (fs.existsSync(failure)) {
    const e = JSON.parse(fs.readFileSync(failure, "utf8")) as WorkerError;
    throw new JobError(e.error, e.message, e.log);
  }
  const pdfPath = path.join(config.cacheDir, `${key}.pdf`);
  const metaPath = path.join(config.cacheDir, `${key}.json`);
  if (!fs.existsSync(pdfPath) || !fs.existsSync(metaPath)) return undefined;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as CacheMeta;
  return { pdfPath, ...meta, cache: "hit" };
}

function writeCache(key: string, builtPdf: string, meta: CacheMeta): Artifact {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  const pdfPath = path.join(config.cacheDir, `${key}.pdf`);
  // Copy then rename, so a reader never sees a half-written PDF.
  const tmp = `${pdfPath}.${process.pid}.tmp`;
  fs.copyFileSync(builtPdf, tmp);
  fs.renameSync(tmp, pdfPath);
  fs.writeFileSync(path.join(config.cacheDir, `${key}.json`), JSON.stringify(meta));
  return { pdfPath, ...meta, cache: "miss" };
}

function writeFailure(key: string, err: JobError) {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  fs.writeFileSync(path.join(config.cacheDir, `${key}.error.json`), JSON.stringify(err.toJSON()));
}

function revKey(rev: RepoRevision): string[] {
  // GitHub names are case-insensitive.
  return [rev.owner.toLowerCase(), rev.repo.toLowerCase(), rev.sha];
}

function cacheKey(parts: string[]): string {
  return crypto.createHash("sha256").update(JSON.stringify([CACHE_VERSION, ...parts])).digest("hex");
}

/** Free slot numbers. A slot number picks the job's sandbox uid, so concurrent jobs never share one. */
const freeSlots = Array.from({ length: config.maxConcurrentJobs }, (_, i) => i);
const waiting: Array<(slot: number) => void> = [];

/** Run at most MAX_JOBS compiles at once; beyond MAX_QUEUED_JOBS waiting, refuse. */
async function withSlot<T>(fn: (slot: number) => Promise<T>): Promise<T> {
  let slot = freeSlots.pop();
  if (slot === undefined) {
    if (waiting.length >= config.maxQueuedJobs) throw new JobError("busy", "Too many compiles running, try again shortly");
    // A finishing job hands its slot straight to us.
    slot = await new Promise<number>((resolve) => waiting.push(resolve));
  }
  try {
    return await fn(slot);
  } finally {
    const next = waiting.shift();
    if (next) next(slot);
    else freeSlots.push(slot);
  }
}
