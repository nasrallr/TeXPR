export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">TeXPR</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        See the compiled PDF of any LaTeX pull request, and compare it with the
        base branch, without checking anything out.
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        Swap <code className="font-mono">github.com</code> for this site in any
        PR link:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-900">
        github.com/owner/repo/pull/12{"\n"}→ texpr.dev/owner/repo/pull/12
      </pre>
    </main>
  );
}
