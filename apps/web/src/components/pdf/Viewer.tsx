"use client";

import { useState } from "react";
import { PdfPage } from "./PdfPage";
import { ErrorsBanner, PdfStatus } from "./Status";
import { usePdf, type PdfState } from "./usePdf";
import { useWidth } from "./useWidth";

export type View = "split" | "overlay" | "changes" | "after";

interface Props {
  headUrl: string;
  /** Missing when the document is new in this PR. */
  baseUrl?: string;
  diffUrl?: string;
  initialView: View;
}

const VIEWS: Array<{ id: View; label: string; needsBase: boolean }> = [
  { id: "split", label: "Side by side", needsBase: true },
  { id: "overlay", label: "Overlay", needsBase: true },
  { id: "changes", label: "Marked-up changes", needsBase: true },
  { id: "after", label: "After only", needsBase: false },
];

export function Viewer({ headUrl, baseUrl, diffUrl, initialView }: Props) {
  const views = VIEWS.filter((v) => !v.needsBase || baseUrl);
  const [view, setView] = useState<View>(views.some((v) => v.id === initialView) ? initialView : views[0]!.id);
  // Load each PDF the first time a view needs it, then keep it.
  const [wanted, setWanted] = useState(() => needs(view));

  const head = usePdf(headUrl, wanted.head);
  const base = usePdf(baseUrl, wanted.base);
  const diff = usePdf(diffUrl, wanted.diff);

  const choose = (next: View) => {
    setView(next);
    const n = needs(next);
    setWanted((w) => ({ head: w.head || n.head, base: w.base || n.base, diff: w.diff || n.diff }));
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="View" className="flex flex-wrap gap-1 self-start rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {views.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => choose(v.id)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 aria-selected:bg-white aria-selected:text-zinc-900 aria-selected:shadow-sm dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-selected:bg-zinc-800 dark:aria-selected:text-zinc-100"
          >
            {v.label}
          </button>
        ))}
      </div>

      {!baseUrl && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This document is new in this pull request, so there&apos;s no earlier version to compare with.
        </p>
      )}

      {view === "split" && <SplitView base={base} head={head} />}
      {view === "overlay" && <OverlayView base={base} head={head} />}
      {view === "changes" && <SingleView state={diff} label="Marked-up changes" legend />}
      {view === "after" && <SingleView state={head} label="After" />}
    </div>
  );
}

function needs(view: View) {
  return {
    head: view === "split" || view === "overlay" || view === "after",
    base: view === "split" || view === "overlay",
    diff: view === "changes",
  };
}

function SingleView({ state, label, legend }: { state: PdfState; label: string; legend?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const pageWidth = Math.min(width, 900);
  return (
    <div ref={ref} className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[900px]">
        <PdfStatus state={state} label={label} />
      </div>
      {state.status === "ready" && (
        <>
          {legend && (
            <p className="w-full max-w-[900px] text-sm text-zinc-600 dark:text-zinc-400">
              <span className="text-blue-700 underline decoration-wavy dark:text-blue-400">Added text</span> is blue and underlined;{" "}
              <span className="text-red-700 line-through dark:text-red-400">removed text</span> is red and struck through.
            </p>
          )}
          {state.hadErrors && (
            <div className="w-full max-w-[900px]">
              <ErrorsBanner />
            </div>
          )}
          {state.pages.map((size, i) => (
            <PdfPage key={i} doc={state.doc} pageNumber={i + 1} size={size} width={pageWidth} className="shadow-md ring-1 ring-black/5" />
          ))}
        </>
      )}
    </div>
  );
}

function SplitView({ base, head }: { base: PdfState; head: PdfState }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gap = 16;
  const column = Math.max(0, Math.floor((width - gap) / 2));
  const count = Math.max(base.status === "ready" ? base.pages.length : 0, head.status === "ready" ? head.pages.length : 0);

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <ColumnHeader title="Before" subtitle="Base of the pull request" state={base} />
        <ColumnHeader title="After" subtitle="This pull request" state={head} />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-4">
          {[base, head].map((state, side) =>
            state.status === "ready" && state.pages[i] ? (
              <PdfPage key={side} doc={state.doc} pageNumber={i + 1} size={state.pages[i]} width={column} className="shadow-md ring-1 ring-black/5" />
            ) : (
              <div key={side} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function ColumnHeader({ title, subtitle, state }: { title: string; subtitle: string; state: PdfState }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-zinc-500">
          {subtitle}
          {state.status === "ready" && ` · ${state.pages.length} ${state.pages.length === 1 ? "page" : "pages"}`}
        </p>
      </div>
      <PdfStatus state={state} label={title} />
      {state.status === "ready" && state.hadErrors && <ErrorsBanner />}
    </div>
  );
}

function OverlayView({ base, head }: { base: PdfState; head: PdfState }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [mix, setMix] = useState(50);
  const [highlight, setHighlight] = useState(false);
  const pageWidth = Math.min(width, 900);
  const ready = base.status === "ready" && head.status === "ready";
  const count = ready ? Math.max(base.pages.length, head.pages.length) : 0;

  return (
    <div ref={ref} className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[900px] flex-col gap-3">
        <PdfStatus state={base} label="Before" />
        <PdfStatus state={head} label="After" />
        {ready && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <label className={`flex items-center gap-3 ${highlight ? "opacity-40" : ""}`}>
              <span className="font-medium">Before</span>
              <input
                type="range"
                min={0}
                max={100}
                value={mix}
                disabled={highlight}
                onChange={(e) => setMix(Number(e.target.value))}
                aria-label="Blend between before and after"
                className="w-40 accent-zinc-800 sm:w-56 dark:accent-zinc-200"
              />
              <span className="font-medium">After</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="size-4 accent-zinc-800 dark:accent-zinc-200" />
              Highlight differences
            </label>
            {highlight && <span className="text-xs text-zinc-500">Unchanged areas fade out; anything that moved or changed stays dark.</span>}
          </div>
        )}
      </div>

      {ready &&
        Array.from({ length: count }, (_, i) => {
          const b = base.pages[i];
          const h = head.pages[i];
          const size = h ?? b!;
          return (
            <div
              key={i}
              className="relative shadow-md ring-1 ring-black/5"
              style={{ width: pageWidth, isolation: "isolate", filter: highlight ? "invert(1)" : undefined }}
            >
              {h ? <PdfPage doc={head.doc} pageNumber={i + 1} size={h} width={pageWidth} /> : <Blank size={size} width={pageWidth} />}
              {b && (
                <PdfPage
                  doc={base.doc}
                  pageNumber={i + 1}
                  size={b}
                  width={pageWidth}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: highlight ? 1 : 1 - mix / 100,
                    mixBlendMode: highlight ? "difference" : "normal",
                  }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

function Blank({ size, width }: { size: { width: number; height: number }; width: number }) {
  return <div style={{ width, height: Math.round((width * size.height) / size.width), background: "white" }} />;
}
