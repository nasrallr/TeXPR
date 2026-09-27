import "server-only";
import { readFile, type ChangedFile } from "./github";

export interface Document {
  /** Root .tex file, repo-relative. */
  path: string;
  /** The PR edits this file directly. */
  changed: boolean;
  /** The PR edits something this document likely pulls in (same folder, subfolder, or a parent's shared file). */
  affected: boolean;
  /** Exists at the base commit (false = added by this PR, so there's nothing to compare against). */
  inBase: boolean;
}

/** Optional repo config: `.texpr.json` → `{ "main": "paper/main.tex" }` or `{ "main": ["a.tex", "b.tex"] }`. */
const CONFIG_FILE = ".texpr.json";
const MAX_FILES_TO_READ = 25;
const LIKELY_NAMES = /(?:^|\/)(?:main|paper|thesis|report|resume|cv|article|manuscript|ms|root)\.tex$/i;
const DOCUMENT_CLASS = /^[^%\n]*\\documentclass\b/m;
const IRRELEVANT = /(?:^|\/)(?:readme|license|changelog)[^/]*$|\.(?:md|ya?ml|json|gitignore|gitattributes)$|^\.github\//i;

interface Inputs {
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
  headTree: string[];
  baseTree: string[];
  changed: ChangedFile[];
  token: string | undefined;
}

/** Root documents in the PR's head commit, most relevant first. */
export async function findDocuments(inputs: Inputs): Promise<Document[]> {
  const { owner, repo, headSha, headTree, token } = inputs;
  const baseSet = new Set(inputs.baseTree);
  const changed = inputs.changed.filter((f) => f.status !== "removed" && !IRRELEVANT.test(f.path));
  const changedSet = new Set(changed.map((f) => f.path));

  const describe = (path: string): Document => ({
    path,
    changed: changedSet.has(path),
    affected: changed.some((f) => touches(f.path, path)),
    inBase: baseSet.has(path),
  });

  const configured = await readConfig(owner, repo, headSha, token, headTree);
  if (configured) return rank(configured.filter((p) => headTree.includes(p)).map(describe));

  const texFiles = headTree.filter((p) => p.toLowerCase().endsWith(".tex"));
  // Reading a file costs a GitHub API call, so read the likeliest ones first.
  const priority = (p: string) =>
    (changedSet.has(p) ? 0 : 4) + (changed.some((f) => touches(f.path, p)) ? 0 : 2) + (LIKELY_NAMES.test(p) ? 0 : 1);
  const toRead = [...texFiles].sort((a, b) => priority(a) - priority(b) || a.length - b.length).slice(0, MAX_FILES_TO_READ);

  const roots = await Promise.all(
    toRead.map(async (p) => ((await readFile(owner, repo, headSha, p, token)) ?? "").match(DOCUMENT_CLASS) && p),
  );
  return rank(roots.filter((p): p is string => Boolean(p)).map(describe));
}

/** Does a change to `file` plausibly affect the document rooted at `root`? */
function touches(file: string, root: string): boolean {
  if (file === root) return true;
  const fileDir = dirname(file);
  const rootDir = dirname(root);
  // In the document's folder or below it (sections/, figures/, refs.bib)…
  if (rootDir === "" || fileDir === rootDir || fileDir.startsWith(`${rootDir}/`)) return true;
  // …or a shared file in a parent folder (docs/Common.text for docs/SRS/SRS.tex).
  // Files at the repo root only count if they look like LaTeX.
  if (fileDir === "") return /\.(?:tex|text|bib|sty|cls|bst)$/i.test(file);
  return rootDir.startsWith(`${fileDir}/`);
}

function rank(docs: Document[]): Document[] {
  const score = (d: Document) => (d.changed ? 0 : d.affected ? 1 : 2);
  return docs.sort((a, b) => score(a) - score(b) || a.path.localeCompare(b.path));
}

async function readConfig(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
  tree: string[],
): Promise<string[] | undefined> {
  if (!tree.includes(CONFIG_FILE)) return undefined;
  try {
    const raw = await readFile(owner, repo, sha, CONFIG_FILE, token);
    const main = (JSON.parse(raw ?? "{}") as { main?: unknown }).main;
    const list = typeof main === "string" ? [main] : Array.isArray(main) ? main : [];
    const paths = list.filter((p): p is string => typeof p === "string" && p.endsWith(".tex"));
    return paths.length > 0 ? paths : undefined;
  } catch {
    return undefined; // malformed config: fall back to detection
  }
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
