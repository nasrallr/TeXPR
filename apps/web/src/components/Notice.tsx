export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="leading-7 text-zinc-600 dark:text-zinc-400 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm dark:[&_code]:bg-zinc-800">
        {children}
      </div>
    </main>
  );
}

export function SignInLink({ returnTo, privateRepos, children }: { returnTo: string; privateRepos?: boolean; children: React.ReactNode }) {
  const params = new URLSearchParams({ returnTo, ...(privateRepos ? { private: "1" } : {}) });
  return (
    // A plain <a>: this route redirects to GitHub, so client-side navigation doesn't apply.
    <a href={`/api/auth/login?${params}`} className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">
      {children}
    </a>
  );
}
