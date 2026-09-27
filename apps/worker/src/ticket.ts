import crypto from "node:crypto";
import { jwtDecrypt } from "jose";
import type { PdfTicket } from "@texpr/shared";
import { config } from "./config.js";
import { JobError } from "./errors.js";
import { parseBuild, parseDiff } from "./validate.js";

const key = () => crypto.createHash("sha256").update(config.secret).digest();

/** Decrypt and validate a ticket issued by the web app. */
export async function openTicket(raw: string | undefined): Promise<PdfTicket> {
  if (!config.secret) throw new JobError("unauthorized", "Tickets need WORKER_SECRET to be set");
  if (!raw) throw new JobError("unauthorized", "Missing ticket");
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtDecrypt(raw, key()));
  } catch {
    throw new JobError("unauthorized", "This link has expired or is invalid. Reload the page.");
  }
  const token = typeof payload.token === "string" ? payload.token : undefined;
  if (payload.kind === "build") {
    const req = parseBuild(payload);
    return { kind: "build", ...req, token };
  }
  if (payload.kind === "diff") {
    const req = parseDiff(payload);
    return { kind: "diff", ...req, token };
  }
  throw new JobError("bad_request", "Unknown ticket kind");
}
