import "server-only";
import { EncryptJWT, jwtDecrypt, base64url } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * The signed-in user. Stored encrypted (not just signed) in an httpOnly
 * cookie, so the GitHub token never reaches the browser's JavaScript.
 */
export interface Session {
  token: string;
  login: string;
  avatarUrl: string;
  /** OAuth scopes granted. "repo" means private repos are readable. */
  scopes: string[];
}

export const SESSION_COOKIE = "texpr_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function key(): Uint8Array {
  const bytes = base64url.decode(env.sessionSecret);
  if (bytes.length !== 32) throw new Error("SESSION_SECRET must be 32 bytes, base64url-encoded");
  return bytes;
}

export async function sealSession(session: Session): Promise<string> {
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .encrypt(key());
}

export async function getSession(): Promise<Session | undefined> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return undefined;
  try {
    const { payload } = await jwtDecrypt(raw, key());
    const { token, login, avatarUrl, scopes } = payload as Partial<Session>;
    if (typeof token !== "string" || typeof login !== "string") return undefined;
    return { token, login, avatarUrl: avatarUrl ?? "", scopes: Array.isArray(scopes) ? scopes : [] };
  } catch {
    return undefined; // expired, tampered with, or the secret changed
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

/** Token to call GitHub with: the user's, else the public-only fallback, else none. */
export async function githubToken(): Promise<string | undefined> {
  return (await getSession())?.token ?? env.publicToken;
}
