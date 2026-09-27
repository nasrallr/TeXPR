import "server-only";
import { createHash } from "node:crypto";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Responses for commit-addressed paths (a tree or comparison at a SHA) never
 * change, so keep them. Keyed by token too: a private repo's data is only
 * reused for the same signed-in user.
 */
const immutableCache = new Map<string, unknown>();

async function ghImmutable<T>(path: string, token: string | undefined): Promise<T> {
  const key = createHash("sha256").update(`${token ?? ""}
${path}`).digest("hex");
  if (immutableCache.has(key)) return immutableCache.get(key) as T;
  const value = await gh<T>(path, token);
  if (immutableCache.size >= 500) immutableCache.delete(immutableCache.keys().next().value!);
  immutableCache.set(key, value);
  return value;
}

/** Status used for "couldn't reach GitHub at all" (dropped connection, DNS, TLS). */
export const NETWORK_ERROR = 503;

/**
 * GET with retries for connection-level failures (a reset during the TLS
 * handshake, a DNS hiccup). HTTP error responses are returned, not retried.
 */
async function getWithRetry(url: string, init: RequestInit): Promise<Response> {
  const attempts = 3;
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i >= attempts) throw new GitHubError(NETWORK_ERROR, `Couldn't reach GitHub: ${String((err as Error).cause ?? err)}`);
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

async function gh<T>(path: string, token: string | undefined): Promise<T> {
  const res = await getWithRetry(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "texpr",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const rateLimited = (res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0";
    throw new GitHubError(rateLimited ? 429 : res.status, `GitHub ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export interface PullInfo {
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: "open" | "closed" | "merged" | "draft";
  htmlUrl: string;
  author: string;
  baseRef: string;
  headRef: string;
  /** Where the PR branched off: what GitHub's "Files changed" diffs against. */
  baseSha: string;
  headSha: string;
}

interface ApiPull {
  number: number;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  html_url: string;
  user: { login: string } | null;
  base: { ref: string; sha: string; repo: { owner: { login: string }; name: string } };
  head: { ref: string; sha: string; label: string };
}

export async function getPull(owner: string, repo: string, number: number, token: string | undefined): Promise<PullInfo> {
  const pr = await gh<ApiPull>(`/repos/${owner}/${repo}/pulls/${number}`, token);
  // base.sha is the base branch tip when the PR was last updated; the merge
  // base is what the PR's changes actually sit on top of.
  const compare = await ghImmutable<{ merge_base_commit: { sha: string } }>(
    `/repos/${owner}/${repo}/compare/${pr.base.sha}...${pr.head.sha}`,
    token,
  );
  return {
    owner: pr.base.repo.owner.login,
    repo: pr.base.repo.name,
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? "merged" : pr.state === "open" && pr.draft ? "draft" : pr.state,
    htmlUrl: pr.html_url,
    author: pr.user?.login ?? "ghost",
    baseRef: pr.base.ref,
    headRef: pr.head.label,
    baseSha: compare.merge_base_commit.sha,
    headSha: pr.head.sha,
  };
}

export interface ChangedFile {
  path: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  previousPath?: string;
}

/** Files the PR touches (GitHub caps this list at 3000; we read the first 300). */
export async function getChangedFiles(
  owner: string,
  repo: string,
  number: number,
  token: string | undefined,
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh<Array<{ filename: string; status: ChangedFile["status"]; previous_filename?: string }>>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      token,
    );
    files.push(...batch.map((f) => ({ path: f.filename, status: f.status, previousPath: f.previous_filename })));
    if (batch.length < 100) break;
  }
  return files;
}

/** Every file path in the commit (GitHub truncates very large trees). */
export async function getTree(owner: string, repo: string, sha: string, token: string | undefined): Promise<string[]> {
  const tree = await ghImmutable<{ tree: Array<{ path: string; type: string }> }>(
    `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
    token,
  );
  return tree.tree.filter((e) => e.type === "blob").map((e) => e.path);
}

/**
 * A file's text at a commit, or undefined if it doesn't exist there.
 * Uses raw.githubusercontent.com, which doesn't count against the API rate
 * limit (60/hour for signed-out visitors). OAuth tokens work there too, for
 * private repos.
 */
export async function readFile(
  owner: string,
  repo: string,
  sha: string,
  path: string,
  token: string | undefined,
): Promise<string | undefined> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await getWithRetry(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encoded}`, {
    headers: { "User-Agent": "texpr", ...(token ? { Authorization: `token ${token}` } : {}) },
    cache: "no-store",
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new GitHubError(res.status, `raw.githubusercontent.com ${res.status} for ${path}`);
  return res.text();
}
