import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { WORKER_HEADERS } from "@texpr/shared";
import { config } from "./config.js";
import { JobError } from "./errors.js";
import { buildPdf, diffPdf, type Artifact } from "./jobs.js";
import { canDropPrivileges } from "./sandbox.js";
import { parseBuild, parseDiff } from "./validate.js";

if (config.production && !config.secret) {
  throw new Error("WORKER_SECRET must be set in production");
}
if (config.production && !canDropPrivileges) {
  throw new Error("In production the worker must start as root so compiles can run as the sandbox user");
}

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// Only the web app may call the worker.
app.use("/build", requireSecret);
app.use("/diff", requireSecret);
app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json(new JobError("bad_request", "Body too large").toJSON(), 413) }));

app.post("/build", async (c) => {
  const req = parseBuild(await readJson(c));
  return sendPdf(c, await buildPdf(req.revision, req.mainFile, githubToken(c)));
});

app.post("/diff", async (c) => {
  const req = parseDiff(await readJson(c));
  return sendPdf(c, await diffPdf(req.base, req.head, req.mainFile, githubToken(c)));
});

app.onError((err, c) => {
  if (err instanceof JobError) return c.json(err.toJSON(), err.status as 400);
  console.error(err);
  return c.json(new JobError("internal", "Something went wrong").toJSON(), 500);
});

async function requireSecret(c: Context, next: () => Promise<void>) {
  if (!config.secret) return next(); // local dev only; production refuses to start without one
  const given = Buffer.from(c.req.header("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${config.secret}`);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new JobError("unauthorized", "Missing or wrong worker secret");
  }
  return next();
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new JobError("bad_request", "Body must be JSON");
  }
}

function githubToken(c: Context): string | undefined {
  return c.req.header("x-github-token") || undefined;
}

function sendPdf(c: Context, artifact: Artifact) {
  const stream = Readable.toWeb(fs.createReadStream(artifact.pdfPath)) as ReadableStream;
  return c.body(stream, 200, {
    "content-type": "application/pdf",
    "content-length": String(fs.statSync(artifact.pdfPath).size),
    [WORKER_HEADERS.cache]: artifact.cache,
    [WORKER_HEADERS.hadErrors]: artifact.hadErrors ? "1" : "0",
    [WORKER_HEADERS.engine]: artifact.engine,
  });
}

fs.mkdirSync(config.jobsDir, { recursive: true });
// Traversable but not listable, so one compile can't discover another job's folder.
fs.chmodSync(config.jobsDir, 0o711);
// Cached PDFs are root-only; the sandbox user never needs them.
fs.mkdirSync(config.cacheDir, { recursive: true, mode: 0o700 });

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`texpr worker listening on :${config.port} (sandboxed compiles: ${canDropPrivileges})`);
});
