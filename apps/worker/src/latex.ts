import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { JobError } from "./errors.js";
import { run, type Sandbox } from "./sandbox.js";

export type Engine = "pdflatex" | "xelatex" | "lualatex";

export interface CompileResult {
  pdfPath: string;
  engine: Engine;
  /** LaTeX reported errors but still wrote a PDF (common for real-world documents). */
  hadErrors: boolean;
}

/**
 * Unpack a GitHub tarball into `dest` (which the sandbox owns), then strip
 * anything that could reach outside it or run code:
 *   - symlinks (a repo could link to /proc/1/environ or /etc/…)
 *   - latexmkrc files (Perl that latexmk would execute; we also pass -norc)
 */
export async function extractTarball(tarball: string, dest: string, sandbox: Sandbox) {
  const limit = config.maxExtractedBytes;

  // Measure the uncompressed size first, reading at most limit+1 bytes, so a
  // gzip bomb can't fill the disk.
  const size = await run(sandbox, "sh", ["-c", `gzip -dc -- "$1" | head -c ${limit + 1} | wc -c`, "sh", tarball], {
    cwd: dest,
    timeoutMs: 60_000,
  });
  if (size.code !== 0 || size.timedOut) throw new JobError("internal", "Couldn't read the repo archive");
  if (Number(size.output.trim()) > limit) {
    throw new JobError("too_large", `Repo is over ${Math.round(limit / 1024 / 1024)}MB uncompressed`);
  }

  const untar = await run(sandbox, "tar", ["-xzf", tarball, "-C", dest, "--strip-components=1", "--no-same-owner"], {
    cwd: dest,
    timeoutMs: 60_000,
  });
  if (untar.code !== 0) throw new JobError("internal", `Couldn't unpack the repo archive: ${untar.output.slice(-500)}`);

  const scrub = await run(
    sandbox,
    "find",
    [dest, "(", "-type", "l", "-o", "-name", "latexmkrc", "-o", "-name", ".latexmkrc", ")", "-delete"],
    { cwd: dest, timeoutMs: 30_000 },
  );
  if (scrub.code !== 0) throw new JobError("internal", "Couldn't clean the unpacked repo");
}

/** Throws not_found unless `mainFile` is a regular file inside `projectDir`. */
export function assertMainFile(projectDir: string, mainFile: string) {
  const abs = path.join(projectDir, mainFile);
  const stat = fs.statSync(abs, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new JobError("not_found", `${mainFile} doesn't exist at this commit`);
}

const MAGIC = /^\s*%\s*!\s*TeX\s+(?:TS-)?program\s*=\s*([a-z]+)/im;
const NEEDS_UNICODE_ENGINE = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:fontspec|unicode-math|polyglossia)\b/;

/** Pick the engine from a `% !TEX program = …` comment, else from the packages loaded. */
export function detectEngine(source: string): Engine {
  const magic = MAGIC.exec(source)?.[1]?.toLowerCase();
  if (magic === "xelatex" || magic === "lualatex" || magic === "pdflatex") return magic;
  return NEEDS_UNICODE_ENGINE.test(source) ? "xelatex" : "pdflatex";
}

const LATEXMK_ENGINE_FLAG: Record<Engine, string> = {
  pdflatex: "-pdf",
  xelatex: "-pdfxe",
  lualatex: "-pdflua",
};

/** Compile `mainFile` (relative to `projectDir`) with latexmk. */
export async function compile(projectDir: string, mainFile: string, sandbox: Sandbox): Promise<CompileResult> {
  const abs = path.join(projectDir, mainFile);
  const cwd = path.dirname(abs);
  const file = path.basename(abs);
  const stem = file.replace(/\.tex$/i, "");

  const engine = detectEngine(readHead(abs));

  const result = await run(
    sandbox,
    "latexmk",
    [
      "-norc", // never run a repo's latexmkrc (it's Perl)
      "-f", // keep going past errors; many real documents have some
      "-interaction=nonstopmode",
      "-file-line-error",
      "-no-shell-escape",
      LATEXMK_ENGINE_FLAG[engine],
      file,
    ],
    { cwd, timeoutMs: config.compileTimeoutMs },
  );

  const pdfPath = path.join(cwd, `${stem}.pdf`);
  const logTail = () => tailLog(path.join(cwd, `${stem}.log`)) ?? result.output.slice(-8000);

  if (result.timedOut) {
    throw new JobError("timeout", `Compiling took longer than ${config.compileTimeoutMs / 1000}s`, logTail());
  }
  const pdf = fs.statSync(pdfPath, { throwIfNoEntry: false });
  if (!pdf?.isFile() || pdf.size === 0) {
    throw new JobError("compile_failed", `${mainFile} didn't compile`, logTail());
  }
  return { pdfPath, engine, hadErrors: result.code !== 0 };
}

/**
 * Run latexdiff between the two checkouts and write the marked-up source next
 * to the head's main file, so its images and .bib files resolve.
 * Returns the diff file's path relative to `headDir`.
 */
export async function latexdiff(
  jobDir: string,
  baseDir: string,
  headDir: string,
  mainFile: string,
  sandbox: Sandbox,
): Promise<string> {
  // latexdiff --flatten inlines \input files itself, outside TeX's own
  // guards, so refuse paths that would reach outside the checkout.
  for (const dir of [baseDir, headDir]) {
    const offender = findEscapingInclude(dir, mainFile);
    if (offender) throw new JobError("unsupported", `${offender} includes a file outside the repo`);
  }

  const diffRel = path.posix.join(path.posix.dirname(mainFile), "texpr-diff.tex");
  const result = await run(
    sandbox,
    "latexdiff",
    ["--flatten", path.relative(jobDir, path.join(baseDir, mainFile)), path.relative(jobDir, path.join(headDir, mainFile))],
    { cwd: jobDir, timeoutMs: config.latexdiffTimeoutMs, stdoutFile: path.join(headDir, diffRel) },
  );
  if (result.timedOut) throw new JobError("timeout", "latexdiff took too long", result.output.slice(-4000));
  if (result.code !== 0) throw new JobError("compile_failed", "latexdiff failed", result.output.slice(-4000));
  return diffRel;
}

const INCLUDE = /\\(?:input|include|subfile|subfileinclude|import|subimport)\s*\{([^}]*)\}/g;
/** Files latexdiff might flatten: anything \input can name, including extensionless and templates' ".text". */
const SCANNED = /(?:\.(?:tex|text|ltx|sty|cls|def|cfg|inc|txt)|\/[^./]+)$/i;

/**
 * First file (repo-relative) with an \input-style path that leaves `root`.
 * Relative paths are resolved against both the including file's folder and
 * the main file's folder (TeX uses the latter), and both must stay inside.
 */
function findEscapingInclude(root: string, mainFile: string): string | undefined {
  const mainDir = path.dirname(path.join(root, mainFile));
  const inside = (p: string) => {
    const rel = path.relative(root, p);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };

  const stack = [root];
  let seen = 0;
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !SCANNED.test(full.replaceAll("\\", "/"))) continue;
      if (++seen > 5000) throw new JobError("too_large", "Repo has too many source files");
      if (fs.statSync(full).size > 2 * 1024 * 1024) continue;

      const text = fs.readFileSync(full, "utf8");
      for (const [, arg] of text.matchAll(INCLUDE)) {
        const p = arg.trim();
        const escapes =
          p.startsWith("/") ||
          p.startsWith("~") ||
          !inside(path.resolve(path.dirname(full), p)) ||
          !inside(path.resolve(mainDir, p));
        if (escapes) return path.relative(root, full).replaceAll("\\", "/");
      }
    }
  }
  return undefined;
}

function readHead(file: string): string {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function tailLog(file: string, lines = 120): string | undefined {
  try {
    return fs.readFileSync(file, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return undefined;
  }
}
