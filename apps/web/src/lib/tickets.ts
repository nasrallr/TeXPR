import "server-only";
import { createHash } from "node:crypto";
import { EncryptJWT } from "jose";
import { TICKET_TTL_SECONDS, type PdfTicket } from "@texpr/shared";
import { env } from "./env";

/** A URL the browser can fetch the PDF from, straight from the worker. */
export async function pdfUrl(ticket: PdfTicket): Promise<string> {
  const key = createHash("sha256").update(env.workerSecret).digest();
  const jwe = await new EncryptJWT({ ...ticket })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .encrypt(key);
  return `${env.workerUrl}/pdf?t=${encodeURIComponent(jwe)}`;
}
