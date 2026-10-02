"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface Props {
  user?: { login: string; avatarUrl: string; privateRepos: boolean };
}

export function SiteHeader({ user }: Props) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const returnTo = search ? `${pathname}?${search}` : pathname;

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="font-mono text-lg font-semibold tracking-tight"
        >
          TeX<span className="text-blue-600 dark:text-blue-400">PRs</span>
        </Link>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/nasrallr/TeXPR"
            target="_blank"
            rel="noreferrer"
            aria-label="TeXPRs source on GitHub"
            title="Source on GitHub"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <svg
              viewBox="0 0 16 16"
              width={20}
              height={20}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny avatar from GitHub's CDN */}
              <img
                src={user.avatarUrl}
                alt=""
                width={24}
                height={24}
                className="size-6 rounded-full"
              />
              <span className="hidden text-zinc-700 sm:inline dark:text-zinc-300">
                {user.login}
              </span>
              {!user.privateRepos && (
                <a
                  href={`/api/auth/login?${new URLSearchParams({ returnTo, private: "1" })}`}
                  className="hidden text-zinc-500 hover:text-zinc-900 md:inline dark:hover:text-zinc-100"
                >
                  Allow private repos
                </a>
              )}
              <form action="/api/auth/logout" method="post">
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <a
              href={`/api/auth/login?${new URLSearchParams({ returnTo })}`}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Sign in with GitHub
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
