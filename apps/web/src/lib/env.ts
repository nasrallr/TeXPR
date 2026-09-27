import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see apps/web/.env.example)`);
  return value;
}

/** Server-side settings. Read lazily so `next build` works without them. */
export const env = {
  get githubClientId() {
    return required("GITHUB_CLIENT_ID");
  },
  get githubClientSecret() {
    return required("GITHUB_CLIENT_SECRET");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get workerUrl() {
    return required("WORKER_URL").replace(/\/+$/, "");
  },
  get workerSecret() {
    return required("WORKER_SECRET");
  },
  /** Public-repos-only token for signed-out visitors. Optional. */
  get publicToken() {
    return process.env.GITHUB_TOKEN || undefined;
  },
};
