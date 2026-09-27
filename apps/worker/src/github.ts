import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { RepoRevision } from "@texpr/shared";
import { config } from "./config.js";
import { JobError } from "./errors.js";

const API = "https://api.github.com";

function headers(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "texpr-worker",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function label(rev: RepoRevision) {
  return `${rev.owner}/${rev.repo}@${rev.sha.slice(0, 7)}`;
}

/**
 * Confirm the caller can see this commit. Runs before every request, cache
 * hits included, so a cached PDF from a private repo is never served to
 * someone without access to that repo.
 */
export async function assertCanRead(rev: RepoRevision, token: string | undefined) {
  const res = await fetch(`${API}/repos/${rev.owner}/${rev.repo}/commits/${rev.sha}`, {
    method: "GET",
    headers: headers(token),
  });
  // Drain the body; we only care about the status.
  await res.arrayBuffer().catch(() => undefined);
  if (res.ok) return;
  if (res.status === 404 || res.status === 422) {
    // GitHub answers 404 for private repos you can't see, so this also covers "no access".
    throw new JobError("not_found", `${label(rev)} not found, or you don't have access to it`);
  }
  if (res.status === 401) throw new JobError("unauthorized", "GitHub rejected the token");
  if (res.status === 403 || res.status === 429) {
    throw new JobError("busy", "GitHub rate limit reached, try again later");
  }
  throw new JobError("internal", `GitHub returned ${res.status} for ${label(rev)}`);
}

/** Download the commit's tarball to `dest`, refusing anything over the size cap. */
export async function downloadTarball(rev: RepoRevision, token: string | undefined, dest: string) {
  const res = await fetch(`${API}/repos/${rev.owner}/${rev.repo}/tarball/${rev.sha}`, {
    headers: headers(token),
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw new JobError(
      res.status === 404 ? "not_found" : "internal",
      `Couldn't download ${label(rev)} (GitHub returned ${res.status})`,
    );
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > config.maxTarballBytes) throw tooLarge(rev);

  let seen = 0;
  const body = Readable.fromWeb(res.body as WebReadableStream<Uint8Array>);
  body.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (seen > config.maxTarballBytes) body.destroy(tooLarge(rev));
  });
  await pipeline(body, fs.createWriteStream(dest, { mode: 0o644 }));
}

function tooLarge(rev: RepoRevision) {
  const mb = Math.round(config.maxTarballBytes / 1024 / 1024);
  return new JobError("too_large", `${label(rev)} is over ${mb}MB compressed`);
}
