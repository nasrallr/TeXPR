import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { OAUTH_COOKIE, safeReturnTo } from "@/lib/oauth";

/**
 * Start GitHub sign-in. `?private=1` asks for the `repo` scope, which is the
 * only way an OAuth app can read private repos (GitHub has no read-only
 * variant), so it's opt-in.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const wantsPrivate = request.nextUrl.searchParams.get("private") === "1";
  const state = randomBytes(16).toString("base64url");

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.githubClientId);
  authorize.searchParams.set("redirect_uri", `${request.nextUrl.origin}/api/auth/callback/github`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", wantsPrivate ? "repo" : "");
  authorize.searchParams.set("allow_signup", "true");

  const response = NextResponse.redirect(authorize);
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return response;
}
