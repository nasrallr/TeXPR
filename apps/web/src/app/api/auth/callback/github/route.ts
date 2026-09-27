import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { OAUTH_COOKIE, safeReturnTo } from "@/lib/oauth";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/session";

/** GitHub sends the user back here after they approve (or cancel) sign-in. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = readOAuthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  const returnTo = safeReturnTo(saved?.returnTo);

  const fail = (reason: string) => {
    const url = new URL(returnTo, request.nextUrl.origin);
    url.searchParams.set("signin", reason);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return res;
  };

  if (params.get("error")) return fail("cancelled");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !saved || !sameString(state, saved.state)) return fail("expired");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: `${request.nextUrl.origin}/api/auth/callback/github`,
    }),
  });
  const grant = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; scope?: string };
  if (!grant.access_token) return fail("failed");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${grant.access_token}`, "User-Agent": "texpr", Accept: "application/vnd.github+json" },
  });
  if (!userRes.ok) return fail("failed");
  const user = (await userRes.json()) as { login: string; avatar_url: string };

  const sealed = await sealSession({
    token: grant.access_token,
    login: user.login,
    avatarUrl: user.avatar_url,
    scopes: (grant.scope ?? "").split(",").filter(Boolean),
  });
  const res = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}

function readOAuthCookie(raw: string | undefined): { state: string; returnTo: string } | undefined {
  try {
    const parsed = JSON.parse(raw ?? "") as { state?: unknown; returnTo?: unknown };
    if (typeof parsed.state !== "string") return undefined;
    return { state: parsed.state, returnTo: typeof parsed.returnTo === "string" ? parsed.returnTo : "/" };
  } catch {
    return undefined;
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
