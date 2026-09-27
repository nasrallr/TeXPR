/**
 * Runs the real unpack → compile → latexdiff code against the fixtures, inside
 * the worker image (it needs TeX Live and root, to drop to the sandbox users).
 *
 *   npm run selftest -w @texpr/worker
 *
 * GitHub downloads aren't exercised here; each fixture is tarred up the same
 * way GitHub does (one top-level folder) and fed to extractTarball.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { JobError } from "../src/errors.js";
import { compile, extractTarball, latexdiff } from "../src/latex.js";
import { canDropPrivileges, makeSandboxDir, sandboxFor, type Sandbox } from "../src/sandbox.js";

const FIXTURES = process.env.FIXTURES ?? "/test/fixtures";
const WORK = fs.mkdtempSync("/tmp/texpr-selftest-");
fs.chmodSync(WORK, 0o711);

let failures = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
async function expectJobError(code: string, fn: () => Promise<unknown>): Promise<JobError> {
  try {
    await fn();
  } catch (err) {
    assert(err instanceof JobError && err.code === code, `expected ${code}, got: ${String(err)}`);
    return err;
  }
  throw new Error(`expected ${code}, but it succeeded`);
}

interface Job {
  dir: string;
  sandbox: Sandbox;
  jobDir: string;
}

/** A job folder owned by the sandbox for `slot`, laid out like jobs.ts does. */
function newJob(slot = 0): Job {
  const jobDir = path.join(WORK, Math.random().toString(36).slice(2, 10));
  const sandbox = sandboxFor(slot, path.join(jobDir, "home"));
  makeSandboxDir(jobDir, sandbox);
  makeSandboxDir(sandbox.home, sandbox);
  return { jobDir, sandbox, dir: "" };
}

/** Tar a fixture like GitHub does (optionally tweaking it first) and unpack it into `job/<name>`. */
async function checkout(job: Job, fixture: string, name = "src", prepare?: (dir: string) => void): Promise<string> {
  const staging = path.join(WORK, "staging", Math.random().toString(36).slice(2), "owner-repo-abc1234");
  fs.mkdirSync(staging, { recursive: true });
  fs.cpSync(path.join(FIXTURES, fixture), staging, { recursive: true });
  prepare?.(staging);
  const tarball = path.join(job.jobDir, `${name}.tar.gz`);
  execFileSync("tar", ["-czf", tarball, "-C", path.dirname(staging), path.basename(staging)]);

  const dest = path.join(job.jobDir, name);
  makeSandboxDir(dest, job.sandbox);
  await extractTarball(tarball, dest, job.sandbox);
  return dest;
}

function pdfText(pdf: string): string {
  return execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
}

await check("running as root with privilege drop", async () => {
  assert(canDropPrivileges, "selftest must run as root inside the worker image");
});

await check("pdflatex paper with \\input and bibtex", async () => {
  const job = newJob();
  const dir = await checkout(job, "paper-v1");
  const res = await compile(dir, "main.tex", job.sandbox);
  assert(res.engine === "pdflatex", `engine was ${res.engine}`);
  assert(!res.hadErrors, "expected a clean compile");
  const text = pdfText(res.pdfPath);
  assert(text.includes("Sorting is a basic problem"), "\\input section missing from PDF");
  assert(text.includes("Knuth"), "bibliography missing from PDF");
});

await check("capstone layout: \\input{../Common.text} from a subfolder", async () => {
  const job = newJob();
  const dir = await checkout(job, "capstone-v1");
  const res = await compile(dir, "docs/ProblemStatement/ProblemStatement.tex", job.sandbox);
  assert(pdfText(res.pdfPath).includes("Squigglr"), "macro from ../Common.text missing");
});

await check("fontspec document picks xelatex", async () => {
  const job = newJob();
  const dir = await checkout(job, "xetex");
  const res = await compile(dir, "main.tex", job.sandbox);
  assert(res.engine === "xelatex", `engine was ${res.engine}`);
  assert(pdfText(res.pdfPath).includes("Straße"), "unicode text missing");
});

await check("recoverable errors still return a PDF", async () => {
  const job = newJob();
  const dir = await checkout(job, "errors");
  const res = await compile(dir, "main.tex", job.sandbox);
  assert(res.hadErrors, "expected hadErrors");
  assert(pdfText(res.pdfPath).includes("still makes a PDF"), "text missing");
});

await check("fatal errors return compile_failed with a log", async () => {
  const job = newJob();
  const dir = await checkout(job, "broken");
  const err = await expectJobError("compile_failed", () => compile(dir, "main.tex", job.sandbox));
  assert(err.log?.includes("thispackagedoesnotexist"), "log doesn't mention the missing package");
});

await check("latexdiff marks up changes, including inside \\input files", async () => {
  const job = newJob();
  const base = await checkout(job, "paper-v1", "base");
  const head = await checkout(job, "paper-v2", "head");
  const diffFile = await latexdiff(job.jobDir, base, head, "main.tex", job.sandbox);
  const source = fs.readFileSync(path.join(head, diffFile), "utf8");
  assert(source.includes("\\DIFadd"), "no additions marked");
  assert(source.includes("\\DIFdel"), "no deletions marked");
  assert(source.includes("compares two algorithms"), "\\input file wasn't flattened into the diff");
  const res = await compile(head, diffFile, job.sandbox);
  assert(pdfText(res.pdfPath).includes("Conclusion"), "added section missing from diff PDF");
});

await check("latexdiff on the capstone layout", async () => {
  const job = newJob();
  const main = "docs/ProblemStatement/ProblemStatement.tex";
  const base = await checkout(job, "capstone-v1", "base");
  const head = await checkout(job, "capstone-v2", "head");
  const diffFile = await latexdiff(job.jobDir, base, head, main, job.sandbox);
  const res = await compile(head, diffFile, job.sandbox);
  const text = pdfText(res.pdfPath);
  assert(text.includes("Goals") && text.includes("Squigglr"), "diff PDF missing content");
});

await check("malicious repo: writing outside the project is refused", async () => {
  const job = newJob();
  const dir = await checkout(job, "evil-write");
  const err = await expectJobError("compile_failed", () => compile(dir, "main.tex", job.sandbox));
  assert(err.log?.includes("I can't write on file"), "log doesn't show the refused write");
  assert(!fs.existsSync(path.join(job.jobDir, "escaped.txt")), "\\openout wrote outside the project");
});

await check("malicious repo: no shell escape, no latexmkrc, no server env, no symlinks", async () => {
  const job = newJob();
  const dir = await checkout(job, "evil", "src", (staging) => {
    fs.symlinkSync("/proc/1/environ", path.join(staging, "leak.txt"));
  });
  assert(!fs.existsSync(path.join(dir, "leak.txt")), "symlink survived extraction");
  assert(!fs.existsSync(path.join(dir, "latexmkrc")), "latexmkrc survived extraction");

  const res = await compile(dir, "main.tex", job.sandbox);
  const text = pdfText(res.pdfPath);
  assert(!fs.existsSync("/tmp/texpr-pwned-write18"), "\\write18 ran a command");
  assert(!fs.existsSync("/tmp/texpr-pwned-latexmkrc"), "latexmkrc ran");
  assert(text.includes("server env blocked"), `server environment was readable: ${text.slice(0, 200)}`);
  assert(text.includes("symlink removed"), "symlink target was readable");
});

await check("concurrent jobs can't read each other's files", async () => {
  const victim = newJob(0);
  const victimDir = await checkout(victim, "paper-v1");
  const secret = path.join(victimDir, "sections", "intro.tex");

  const attacker = newJob(1);
  const dir = await checkout(attacker, "errors", "src", (staging) => {
    fs.writeFileSync(
      path.join(staging, "main.tex"),
      `\\documentclass{article}\\begin{document}\\IfFileExists{${secret}}{OTHER-JOB-READABLE}{other job blocked}\\end{document}\n`,
    );
  });
  const res = await compile(dir, "main.tex", attacker.sandbox);
  assert(pdfText(res.pdfPath).includes("other job blocked"), "a compile read another job's checkout");
});

await check("latexdiff refuses \\input of absolute paths", async () => {
  const job = newJob();
  const base = await checkout(job, "paper-v1", "base");
  const head = await checkout(job, "paper-v2", "head", (staging) => {
    fs.appendFileSync(path.join(staging, "sections", "intro.tex"), "\n\\input{/proc/1/environ}\n");
  });
  await expectJobError("unsupported", () => latexdiff(job.jobDir, base, head, "main.tex", job.sandbox));
});

await check("latexdiff refuses .. paths that leave the repo", async () => {
  const job = newJob();
  const base = await checkout(job, "paper-v1", "base");
  const head = await checkout(job, "paper-v2", "head", (staging) => {
    fs.appendFileSync(path.join(staging, "main.tex"), "\n\\input{../base/sections/intro}\n");
  });
  await expectJobError("unsupported", () => latexdiff(job.jobDir, base, head, "main.tex", job.sandbox));
});

fs.rmSync(WORK, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
