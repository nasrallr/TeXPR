import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// POST /compile lands in the next part: fetch both revisions, run latexmk in a
// sandbox, run latexdiff, cache the PDFs by commit SHA.

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () => {
  console.log(`texpr worker listening on :${port}`);
});
