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
        <Link href="/" className="font-mono text-lg font-semibold tracking-tight">
          TeX<span className="text-blue-600 dark:text-blue-400">PRs</span>
        </Link>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny avatar from GitHub's CDN */}
            <img src={user.avatarUrl} alt="" width={24} height={24} className="size-6 rounded-full" />
            <span className="hidden text-zinc-700 sm:inline dark:text-zinc-300">{user.login}</span>
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
              <button type="submit" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
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
    </header>
  );
}
