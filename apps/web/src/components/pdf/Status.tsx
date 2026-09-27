"use client";

import { useEffect, useState } from "react";
import type { PdfState } from "./usePdf";

/** Loading and error states for one PDF. Renders nothing once it's ready. */
export function PdfStatus({ state, label }: { state: PdfState; label: string }) {
  if (state.status === "loading") return <Compiling label={label} startedAt={state.startedAt} />;
  if (state.status !== "error") return null;

  const { error } = state;
  const title =
    error.error === "compile_failed"
      ? `${label} didn't compile`
      : error.error === "not_found"
        ? `${label}: not found`
        : error.error === "timeout"
          ? `${label} took too long to compile`
          : `${label} couldn't be loaded`;

  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      <p className="font-medium">{title}</p>
      <p className="mt-1">{error.message}</p>
      {error.log && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none font-medium">LaTeX log</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded bg-white p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {error.log}
          </pre>
        </details>
      )}
    </div>
  );
}

function Compiling({ label, startedAt }: { label: string; startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
      <span>
        Compiling {label.toLowerCase()}… {seconds}s
        {seconds >= 8 && <span className="text-zinc-500"> (first builds can take up to a minute)</span>}
      </span>
    </div>
  );
}

export function ErrorsBanner() {
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      LaTeX reported errors, but still produced a PDF. It may not match what your editor shows.
    </p>
  );
}
