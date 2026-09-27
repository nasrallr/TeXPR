/** Short-lived cookie holding the OAuth `state` and where to go after sign-in. */
export const OAUTH_COOKIE = "texpr_oauth";

/** Only same-site paths, so sign-in can't be used to redirect people elsewhere. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}
