import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/oauth";
import { SESSION_COOKIE } from "@/lib/session";

/** POST only, so a link or image on another site can't sign people out. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => undefined);
  const returnTo = safeReturnTo(form?.get("returnTo")?.toString());
  // 303 turns the POST into a GET on the page we send them back to.
  const res = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
