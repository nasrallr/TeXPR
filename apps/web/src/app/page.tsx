import { OpenPrForm } from "@/components/OpenPrForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-4 py-20 sm:px-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">See the PDF, not just the diff.</h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          TeXPRs compiles the LaTeX in a GitHub pull request and shows the PDF before and after, side by side, overlaid,
          or with every change marked up. No cloning, no checking out branches.
        </p>
      </div>

      <OpenPrForm />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Or swap <code className="font-mono">github.com</code> for <code className="font-mono">texprs.com</code> in any pull request link:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 font-mono text-sm leading-6 dark:bg-zinc-900">
          <span className="text-zinc-500">github.com</span>/owner/repo/pull/12{"\n"}
          <span className="text-blue-600 dark:text-blue-400">texprs.com</span>/owner/repo/pull/12
        </pre>
      </div>
    </main>
  );
}
