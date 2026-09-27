import type { Metadata } from "next";
import Link from "next/link";
import { Viewer, type View } from "@/components/pdf/Viewer";
import { Notice, SignInLink } from "@/components/Notice";
import { getChangedFiles, getPull, getTree, GitHubError, NETWORK_ERROR, type PullInfo } from "@/lib/github";
import { findDocuments, type Document } from "@/lib/mainfile";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import { pdfUrl } from "@/lib/tickets";

type Props = PageProps<"/[owner]/[repo]/pull/[number]/[[...rest]]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo, number } = await params;
  return { title: `${owner}/${repo}#${number} · TeXPRs` };
}

const VIEWS: View[] = ["split", "overlay", "changes", "after"];

export default async function PullPage({ params, searchParams }: Props) {
  const { owner, repo, number } = await params;
  const query = await searchParams;
  const here = `/${owner}/${repo}/pull/${number}`;
  const prNumber = Number(number);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return <Notice title="That isn't a pull request link">Pull request links end in a number, like /pull/12.</Notice>;
  }

  const session = await getSession();
  const token = session?.token ?? env.publicToken;

  let pr: PullInfo;
  let documents: Document[];
  try {
    pr = await getPull(owner, repo, prNumber, token);
    const [changed, headTree, baseTree] = await Promise.all([
      getChangedFiles(pr.owner, pr.repo, pr.number, token),
      getTree(pr.owner, pr.repo, pr.headSha, token),
      getTree(pr.owner, pr.repo, pr.baseSha, token),
    ]);
    documents = await findDocuments({ owner: pr.owner, repo: pr.repo, baseSha: pr.baseSha, headSha: pr.headSha, headTree, baseTree, changed, token });
  } catch (err) {
    return <LoadError err={err} signedIn={Boolean(session)} canSeePrivate={session?.scopes.includes("repo") ?? false} returnTo={here} />;
  }

  const selected = documents.find((d) => d.path === first(query.file)) ?? documents[0];
  if (!selected) {
    return (
      <Shell pr={pr}>
        <Notice title="No LaTeX document found">
          TeXPRs couldn&apos;t find a <code>.tex</code> file with <code>\documentclass</code> in this pull request. If the
          main file is somewhere unusual, add a <code>.texpr.json</code> file to the repo:{" "}
          <code>{`{ "main": "path/to/main.tex" }`}</code>
        </Notice>
      </Shell>
    );
  }

  const base = { owner: pr.owner, repo: pr.repo, sha: pr.baseSha };
  const head = { owner: pr.owner, repo: pr.repo, sha: pr.headSha };
  const mainFile = selected.path;
  const [headUrl, baseUrl, diffUrl] = await Promise.all([
    pdfUrl({ kind: "build", revision: head, mainFile, token }),
    selected.inBase ? pdfUrl({ kind: "build", revision: base, mainFile, token }) : undefined,
    selected.inBase ? pdfUrl({ kind: "diff", base, head, mainFile, token }) : undefined,
  ]);
  const requestedView = first(query.view) as View | undefined;

  return (
    <Shell pr={pr}>
      {documents.length > 1 && <DocumentPicker documents={documents} selected={selected.path} here={here} view={requestedView} />}
      <Viewer
        // Remount when the document changes, so old PDFs don't linger.
        key={selected.path}
        headUrl={headUrl}
        baseUrl={baseUrl}
        diffUrl={diffUrl}
        initialView={requestedView && VIEWS.includes(requestedView) ? requestedView : "changes"}
      />
    </Shell>
  );
}

function Shell({ pr, children }: { pr: PullInfo; children: React.ReactNode }) {
  const stateStyle: Record<PullInfo["state"], string> = {
    open: "bg-green-600",
    draft: "bg-zinc-500",
    merged: "bg-purple-600",
    closed: "bg-red-600",
  };
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          <a href={`https://github.com/${pr.owner}/${pr.repo}`} className="hover:underline">
            {pr.owner}/{pr.repo}
          </a>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {pr.title} <span className="font-normal text-zinc-500">#{pr.number}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize text-white ${stateStyle[pr.state]}`}>{pr.state}</span>
          <span>
            {pr.author} wants to merge <Branch>{pr.headRef}</Branch> into <Branch>{pr.baseRef}</Branch>
          </span>
          <a href={pr.htmlUrl} className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100">
            View on GitHub ↗
          </a>
        </div>
      </header>
      {children}
    </main>
  );
}

function Branch({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-300">{children}</code>;
}

function DocumentPicker({ documents, selected, here, view }: { documents: Document[]; selected: string; here: string; view?: string }) {
  const relevant = documents.filter((d) => d.changed || d.affected);
  // Show what this PR touches up front; fold the rest of the repo's documents away.
  const shown = relevant.length > 0 ? relevant : documents;
  const others = documents.filter((d) => !shown.includes(d));
  const selectedIsOther = others.some((d) => d.path === selected);

  return (
    <nav aria-label="Documents" className="flex flex-col gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {relevant.length > 0 ? "Documents this pull request changes" : "Documents in this repo"}
      </h2>
      <DocumentList documents={shown} selected={selected} here={here} view={view} />
      {others.length > 0 && (
        <details open={selectedIsOther} className="group">
          <summary className="cursor-pointer select-none text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Other documents in this repo ({others.length})
          </summary>
          <div className="mt-2">
            <DocumentList documents={others} selected={selected} here={here} view={view} />
          </div>
        </details>
      )}
    </nav>
  );
}

function DocumentList({ documents, selected, here, view }: { documents: Document[]; selected: string; here: string; view?: string }) {
  const href = (path: string) => `${here}?${new URLSearchParams({ file: path, ...(view ? { view } : {}) })}`;
  return (
    <ul className="flex flex-wrap gap-2">
      {documents.map((d) => (
        <li key={d.path} className="min-w-0 max-w-full">
          <Link
            href={href(d.path)}
            aria-current={d.path === selected ? "page" : undefined}
            className="flex items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-700 hover:border-zinc-400 aria-[current=page]:border-zinc-900 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-900"
          >
            <span className="truncate">{d.path}</span>
            {(d.changed || d.affected) && (
              <span className="shrink-0 rounded bg-amber-100 px-1 font-sans text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {d.changed ? "edited" : "affected"}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LoadError({ err, signedIn, canSeePrivate, returnTo }: { err: unknown; signedIn: boolean; canSeePrivate: boolean; returnTo: string }) {
  if (err instanceof GitHubError && err.status === 404) {
    return (
      <Notice title="Pull request not found">
        It doesn&apos;t exist, or it&apos;s in a private repo.{" "}
        {canSeePrivate ? (
          "Your GitHub account doesn't have access to it."
        ) : (
          <>
            <SignInLink returnTo={returnTo} privateRepos>
              {signedIn ? "Allow access to private repos" : "Sign in with GitHub"}
            </SignInLink>{" "}
            to view private pull requests.
          </>
        )}
      </Notice>
    );
  }
  if (err instanceof GitHubError && err.status === 429) {
    return (
      <Notice title="GitHub rate limit reached">
        GitHub limits how often signed-out visitors can load data.{" "}
        {signedIn ? "Try again in a few minutes." : <><SignInLink returnTo={returnTo}>Sign in with GitHub</SignInLink> to keep going.</>}
      </Notice>
    );
  }
  if (err instanceof GitHubError && err.status === NETWORK_ERROR) {
    return (
      <Notice title="Couldn't reach GitHub">
        The connection to GitHub dropped, or GitHub is having trouble. <a href={returnTo} className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100">Try again</a>.
      </Notice>
    );
  }
  if (err instanceof GitHubError && err.status === 401) {
    return (
      <Notice title="Your GitHub sign-in has expired">
        <SignInLink returnTo={returnTo}>Sign in again</SignInLink> to continue.
      </Notice>
    );
  }
  throw err;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
