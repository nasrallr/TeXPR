import { spawn } from "node:child_process";
import fs from "node:fs";
import { config } from "./config.js";

export interface RunResult {
  code: number | null;
  timedOut: boolean;
  /** Last OUTPUT_CAP bytes of combined stdout/stderr (stderr only when stdout goes to a file). */
  output: string;
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
  /** Send stdout to this file instead of capturing it. */
  stdoutFile?: string;
}

const OUTPUT_CAP = 64 * 1024;

/** True when we can drop privileges for child processes (the Docker image runs the server as root). */
export const canDropPrivileges = process.getuid?.() === 0;

/**
 * Environment for anything that touches repo content. Built from scratch so no
 * server secret leaks into a child, and TeX's own file-access guards are on:
 *   openin_any/openout_any=p  no absolute paths, no "..", no dotfiles
 *   shell_escape=f            no \write18
 * The dead proxy stops tools that can fetch URLs (biber remote .bib files)
 * from reaching the network.
 */
export function sandboxEnv(home: string): Record<string, string> {
  const deadProxy = "http://127.0.0.1:9";
  return {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: home,
    TEXMFVAR: `${home}/texmf-var`,
    TEXMFCONFIG: `${home}/texmf-config`,
    LANG: "C.UTF-8",
    openin_any: "p",
    openout_any: "p",
    shell_escape: "f",
    http_proxy: deadProxy,
    https_proxy: deadProxy,
    HTTP_PROXY: deadProxy,
    HTTPS_PROXY: deadProxy,
    ALL_PROXY: deadProxy,
    no_proxy: "",
  };
}

/**
 * Run a command as the sandbox user with a hard timeout. The whole process
 * group is killed on timeout, so latexmk's children (pdflatex, biber) die too.
 */
export function run(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const stdoutFd = opts.stdoutFile ? fs.openSync(opts.stdoutFile, "w", 0o644) : undefined;
    if (stdoutFd !== undefined && canDropPrivileges) {
      fs.fchownSync(stdoutFd, config.sandboxUid, config.sandboxGid);
    }

    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? {},
      stdio: ["ignore", stdoutFd ?? "pipe", "pipe"],
      detached: process.platform !== "win32",
      ...(canDropPrivileges ? { uid: config.sandboxUid, gid: config.sandboxGid } : {}),
    });

    let output = "";
    const append = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > OUTPUT_CAP) output = output.slice(-OUTPUT_CAP);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, opts.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      if (stdoutFd !== undefined) fs.closeSync(stdoutFd);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stdoutFd !== undefined) fs.closeSync(stdoutFd);
      resolve({ code, timedOut, output });
    });
  });
}

function killTree(pid: number | undefined) {
  if (pid === undefined) return;
  try {
    // Negative pid = the process group created by `detached: true`.
    process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/** Make a directory the sandbox user owns, so compiles can write into it and nothing else. */
export function makeSandboxDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  if (canDropPrivileges) fs.chownSync(dir, config.sandboxUid, config.sandboxGid);
}
