"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Accepts a GitHub PR URL, "owner/repo#12" or "owner/repo/pull/12". */
export function parsePrReference(input: string): string | undefined {
  const text = input.trim();
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i.exec(text);
  const short = /^([\w.-]+)\/([\w.-]+)(?:#|\/pull\/)(\d+)$/.exec(text);
  const m = url ?? short;
  return m ? `/${m[1]}/${m[2]}/pull/${m[3]}` : undefined;
}

export function OpenPrForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const path = parsePrReference(value);
        setError(!path);
        if (path) router.push(path);
      }}
    >
      <label htmlFor="pr" className="text-sm font-medium">
        Pull request
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="pr"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="https://github.com/owner/repo/pull/12"
          aria-invalid={error}
          aria-describedby={error ? "pr-error" : undefined}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
        />
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          View PDFs
        </button>
      </div>
      {error && (
        <p id="pr-error" className="text-sm text-red-600 dark:text-red-400">
          Paste a GitHub pull request link, like github.com/owner/repo/pull/12.
        </p>
      )}
    </form>
  );
}
