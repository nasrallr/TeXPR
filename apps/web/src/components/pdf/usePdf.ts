"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { WORKER_HEADERS, type WorkerError } from "@texpr/shared";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | undefined;

/** Load pdf.js once, in the browser only, with its worker bundled alongside. */
export function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

export interface PageSize {
  width: number;
  height: number;
}

export type PdfState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "error"; error: WorkerError }
  | { status: "ready"; doc: PDFDocumentProxy; pages: PageSize[]; hadErrors: boolean };

/** Fetch a PDF from the worker (compiling it if needed) and open it with pdf.js. */
export function usePdf(url: string | undefined, enabled = true): PdfState {
  const [state, setState] = useState<PdfState>({ status: "idle" });

  useEffect(() => {
    if (!url || !enabled) return;
    const abort = new AbortController();
    let loading: PDFDocumentLoadingTask | undefined;
    // Deferred so the effect itself doesn't set state synchronously.
    queueMicrotask(() => !abort.signal.aborted && setState({ status: "loading", startedAt: Date.now() }));

    (async () => {
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) {
        const error = (await res.json().catch(() => undefined)) as WorkerError | undefined;
        throw error ?? { error: "internal", message: `The compile server returned ${res.status}` };
      }
      const hadErrors = res.headers.get(WORKER_HEADERS.hadErrors) === "1";
      const data = new Uint8Array(await res.arrayBuffer());
      const pdfjs = await loadPdfjs();
      if (abort.signal.aborted) return;
      loading = pdfjs.getDocument({ data });
      const doc = await loading.promise;
      const pages: PageSize[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const viewport = (await doc.getPage(i)).getViewport({ scale: 1 });
        pages.push({ width: viewport.width, height: viewport.height });
      }
      if (!abort.signal.aborted) setState({ status: "ready", doc, pages, hadErrors });
    })().catch((err: unknown) => {
      if (abort.signal.aborted) return;
      const error: WorkerError =
        typeof err === "object" && err !== null && "error" in err
          ? (err as WorkerError)
          : { error: "internal", message: "Couldn't reach the compile server. Is it running?" };
      setState({ status: "error", error });
    });

    return () => {
      abort.abort();
      void loading?.destroy();
    };
  }, [url, enabled]);

  return state;
}
