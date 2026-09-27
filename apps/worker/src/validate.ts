import path from "node:path";
import type { BuildRequest, DiffRequest, RepoRevision } from "@texpr/shared";
import { JobError } from "./errors.js";

const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

function revision(value: unknown, field: string): RepoRevision {
  const v = value as Partial<RepoRevision> | undefined;
  if (typeof v?.owner !== "string" || !NAME.test(v.owner)) throw bad(`${field}.owner is invalid`);
  if (typeof v.repo !== "string" || !NAME.test(v.repo) || v.repo === "." || v.repo === "..") {
    throw bad(`${field}.repo is invalid`);
  }
  if (typeof v.sha !== "string" || !SHA.test(v.sha)) throw bad(`${field}.sha must be a full 40-character commit SHA`);
  return { owner: v.owner, repo: v.repo, sha: v.sha };
}

/** A repo-relative path to a .tex file that can't climb out of the checkout. */
function mainFile(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) throw bad("mainFile is required");
  if (/[\0\\]/.test(value)) throw bad("mainFile contains invalid characters");
  const normal = path.posix.normalize(value);
  if (normal.startsWith("/") || normal === ".." || normal.startsWith("../")) throw bad("mainFile must be inside the repo");
  if (!normal.toLowerCase().endsWith(".tex")) throw bad("mainFile must be a .tex file");
  return normal;
}

export function parseBuild(body: unknown): BuildRequest {
  const b = body as Partial<BuildRequest> | undefined;
  return { revision: revision(b?.revision, "revision"), mainFile: mainFile(b?.mainFile) };
}

export function parseDiff(body: unknown): DiffRequest {
  const b = body as Partial<DiffRequest> | undefined;
  return { base: revision(b?.base, "base"), head: revision(b?.head, "head"), mainFile: mainFile(b?.mainFile) };
}

function bad(message: string) {
  return new JobError("bad_request", message);
}
