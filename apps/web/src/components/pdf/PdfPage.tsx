"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PageSize } from "./usePdf";

interface Props {
  doc: PDFDocumentProxy;
  /** 1-based. */
  pageNumber: number;
  size: PageSize;
  /** CSS pixels. */
  width: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One PDF page on a canvas, rendered only once it's near the viewport, at the
 * screen's pixel density so text stays sharp.
 */
export function PdfPage({ doc, pageNumber, size, width, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const height = Math.round((width * size.height) / size.width);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => entry && setVisible(entry.isIntersecting), {
      rootMargin: "1200px 0px",
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || width <= 0) return;
    let task: RenderTask | undefined;
    let cancelled = false;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = page.getViewport({ scale: (width / size.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      await task.promise;
    })().catch(() => {
      // Cancelled by a newer render, or the document was closed.
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width, size.width, visible]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Page ${pageNumber}`}
      className={className}
      style={{ width, height, display: "block", background: "white", ...style }}
    />
  );
}
