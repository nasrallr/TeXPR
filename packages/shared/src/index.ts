/** A single git revision of a LaTeX project on GitHub. */
export interface RepoRevision {
  owner: string;
  repo: string;
  /** Full commit SHA. Compiles are cached by this, so never pass a branch name. */
  sha: string;
}

/** What the web app asks the worker to build for one PR. */
export interface CompileRequest {
  base: RepoRevision;
  head: RepoRevision;
  /** Path of the root .tex file, relative to the repo root (e.g. "paper/main.tex"). */
  mainFile: string;
  /** Also produce a latexdiff PDF with changes marked up. */
  latexdiff: boolean;
}

export type CompileStatus = "queued" | "compiling" | "done" | "failed";

export interface CompileArtifact {
  kind: "base" | "head" | "diff";
  status: CompileStatus;
  /** Where the web app can fetch the PDF once status is "done". */
  pdfUrl?: string;
  /** Tail of the LaTeX log when status is "failed". */
  log?: string;
}

export interface CompileResponse {
  id: string;
  artifacts: CompileArtifact[];
}
