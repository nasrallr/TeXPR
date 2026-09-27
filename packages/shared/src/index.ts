/** A single git revision of a GitHub repo. */
export interface RepoRevision {
  owner: string;
  repo: string;
  /** Full 40-character commit SHA. Results are cached by it, so never pass a branch name. */
  sha: string;
}

/**
 * POST /build — compile one revision. Responds with `application/pdf`, or a
 * {@link WorkerError} body.
 *
 * The user's GitHub token, if any, goes in the `X-GitHub-Token` header, never
 * in the body.
 */
export interface BuildRequest {
  revision: RepoRevision;
  /** Root .tex file, relative to the repo root (e.g. "paper/main.tex"). */
  mainFile: string;
}

/**
 * POST /diff — run latexdiff between two revisions and compile the result.
 * Same response shape as /build.
 */
export interface DiffRequest {
  base: RepoRevision;
  head: RepoRevision;
  mainFile: string;
}

export type WorkerErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "too_large"
  | "unsupported"
  | "timeout"
  | "compile_failed"
  | "busy"
  | "internal";

export interface WorkerError {
  error: WorkerErrorCode;
  message: string;
  /** Tail of the LaTeX log, for compile failures. */
  log?: string;
}

/** Response headers the worker sets on a PDF. */
export const WORKER_HEADERS = {
  /** "hit" or "miss". */
  cache: "x-texpr-cache",
  /** "1" when LaTeX reported errors but still produced a PDF. */
  hadErrors: "x-texpr-had-errors",
  /** Engine used: "pdflatex" | "xelatex" | "lualatex". */
  engine: "x-texpr-engine",
} as const;
