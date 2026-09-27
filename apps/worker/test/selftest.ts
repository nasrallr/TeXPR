/**
 * Runs the real unpack → compile → latexdiff code against the fixtures, inside
 * the worker image (it needs TeX Live and root, to drop to the sandbox user).
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
import { canDropPrivileges, makeSandboxDir } from "../src/sandbox.js";

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

/** Tar a fixture like GitHub does, optionally adding extra entries first, then unpack it into a sandbox dir. */
async function checkout(fixture: string, prepare?: (dir: string) => void): Promise<{ dir: string; home: string }> {
  const job = path.join(WORK, `${fixture}-${Math.random().toString(36).slice(2, 8)}`);
  const staging = path.join(job, "staging", "owner-repo-abc1234");
  fs.mkdirSync(staging, { recursive: true });
  fs.cpSync(path.join(FIXTURES, fixture), staging, { recursive: true });
  prepare?.(staging);
  const tarball = path.join(job, "src.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", path.dirname(staging), path.basename(staging)]);

  makeSandboxDir(job);
  const dir = path.join(job, "src");
  const home = path.join(job, "home");
  makeSandboxDir(dir);
  makeSandboxDir(home);
  await extractTarball(tarball, dir, home);
  return { dir, home };
}

function pdfText(pdf: string): string {
  return execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
}

await check("running as root with privilege drop", async () => {
  assert(canDropPrivileges, "selftest must run as root inside the worker image");
});

await check("pdflatex paper with \\input and bibtex", async () => {
  const { dir, home } = await checkout("paper-v1");
  const res = await compile(dir, "main.tex", home);
  assert(res.engine === "pdflatex", `engine was ${res.engine}`);
  assert(!res.hadErrors, "expected a clean compile");
  const text = pdfText(res.pdfPath);
  assert(text.includes("Sorting is a basic problem"), "\\input section missing from PDF");
  assert(text.includes("Knuth"), "bibliography missing from PDF");
});

await check("fontspec document picks xelatex", async () => {
  const { dir, home } = await checkout("xetex");
  const res = await compile(dir, "main.tex", home);
  assert(res.engine === "xelatex", `engine was ${res.engine}`);
  assert(pdfText(res.pdfPath).includes("Straße"), "unicode text missing");
});

await check("recoverable errors still return a PDF", async () => {
  const { dir, home } = await checkout("errors");
  const res = await compile(dir, "main.tex", home);
  assert(res.hadErrors, "expected hadErrors");
  assert(pdfText(res.pdfPath).includes("still makes a PDF"), "text missing");
});

await check("fatal errors return compile_failed with a log", async () => {
  const { dir, home } = await checkout("broken");
  try {
    await compile(dir, "main.tex", home);
    throw new Error("expected a failure");
  } catch (err) {
    assert(err instanceof JobError && err.code === "compile_failed", `wrong error: ${String(err)}`);
    assert(err.log?.includes("thispackagedoesnotexist"), "log doesn't mention the missing package");
  }
});

await check("latexdiff marks up changes, including inside \\input files", async () => {
  const job = path.join(WORK, "diff");
  makeSandboxDir(job);
  const base = await checkout("paper-v1");
  const head = await checkout("paper-v2");
  // latexdiff runs from the job folder with both checkouts under it, as in jobs.ts.
  const baseDir = path.join(job, "base");
  const headDir = path.join(job, "head");
  fs.renameSync(base.dir, baseDir);
  fs.renameSync(head.dir, headDir);
  const diffFile = await latexdiff(job, baseDir, headDir, "main.tex", head.home);
  const source = fs.readFileSync(path.join(headDir, diffFile), "utf8");
  assert(source.includes("\\DIFadd"), "no additions marked");
  assert(source.includes("\\DIFdel"), "no deletions marked");
  assert(source.includes("compares two algorithms"), "\\input file wasn't flattened into the diff");
  const res = await compile(headDir, diffFile, head.home);
  assert(pdfText(res.pdfPath).includes("Conclusion"), "added section missing from diff PDF");
});

await check("malicious repo: writing outside the project is refused", async () => {
  const { dir, home } = await checkout("evil-write");
  try {
    await compile(dir, "main.tex", home);
    throw new Error("expected a failure");
  } catch (err) {
    assert(err instanceof JobError && err.code === "compile_failed", `wrong error: ${String(err)}`);
    assert(err.log?.includes("I can't write on file"), "log doesn't show the refused write");
  }
  assert(!fs.existsSync(path.join(path.dirname(dir), "escaped.txt")), "\\openout wrote outside the project");
});

await check("malicious repo: no shell escape, no latexmkrc, no absolute reads, no symlinks", async () => {
  const { dir, home } = await checkout("evil", (staging) => {
    fs.symlinkSync("/proc/1/environ", path.join(staging, "leak.txt"));
  });
  assert(!fs.existsSync(path.join(dir, "leak.txt")), "symlink survived extraction");
  assert(!fs.existsSync(path.join(dir, "latexmkrc")), "latexmkrc survived extraction");

  const res = await compile(dir, "main.tex", home);
  const text = pdfText(res.pdfPath);
  assert(!fs.existsSync("/tmp/texpr-pwned-write18"), "\\write18 ran a command");
  assert(!fs.existsSync("/tmp/texpr-pwned-latexmkrc"), "latexmkrc ran");
  assert(text.includes("absolute read blocked"), `absolute path was readable: ${text.slice(0, 200)}`);
  assert(text.includes("symlink removed"), "symlink target was readable");
});

await check("latexdiff refuses \\input of absolute paths", async () => {
  const job = path.join(WORK, "diff-evil");
  makeSandboxDir(job);
  const base = await checkout("paper-v1");
  const head = await checkout("paper-v2", (staging) => {
    fs.appendFileSync(path.join(staging, "sections", "intro.tex"), "\n\\input{/proc/1/environ}\n");
  });
  const baseDir = path.join(job, "base");
  const headDir = path.join(job, "head");
  fs.renameSync(base.dir, baseDir);
  fs.renameSync(head.dir, headDir);
  try {
    await latexdiff(job, baseDir, headDir, "main.tex", head.home);
    throw new Error("expected a refusal");
  } catch (err) {
    assert(err instanceof JobError && err.code === "unsupported", `wrong error: ${String(err)}`);
  }
});

fs.rmSync(WORK, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
