# TeXPR

View the compiled PDF of a LaTeX pull request on GitHub, and compare it with the
base branch, without checking out the branch.

Swap `github.com` for the TeXPR domain in any PR link:

```
github.com/owner/repo/pull/12  →  texpr.dev/owner/repo/pull/12
```

Planned views: side by side (synced scrolling), overlay/flicker, and a
[latexdiff](https://github.com/ftilmann/latexdiff) PDF with changes marked up.

## Layout

| Path | What it is | Runs on |
| --- | --- | --- |
| `apps/web` | Next.js app: PR pages, GitHub login, PDF viewer | Vercel |
| `apps/worker` | Compile service: TeX Live, `latexmk`, `latexdiff` | Docker (Fly.io or Cloud Run) |
| `packages/shared` | Types shared by web and worker | — |

LaTeX can't compile on Vercel (no TeX Live, function size limits), so compiling
lives in the worker container.

## Development

Needs Node 22+ and Docker.

1. Build and start the worker (first build takes ~5 min):

   ```sh
   docker build -f apps/worker/Dockerfile -t texpr-worker .
   docker run -p 8080:8080 -e WORKER_SECRET=devsecret texpr-worker
   ```

2. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in
   (GitHub OAuth app, a `SESSION_SECRET`, and `WORKER_SECRET=devsecret`).

3. Start the site:

   ```sh
   npm install
   npm run dev:web      # http://localhost:3000
   ```

4. Open any LaTeX PR, e.g. http://localhost:3000/owner/repo/pull/12

Checks: `npm run typecheck`, `npm run lint`, `npm run build`, and
`npm run selftest -w @texpr/worker` (compiles the fixtures inside the image).

## How a page loads

1. The site reads the PR from GitHub (as the signed-in user, if any), finds
   the root `.tex` files and picks the one the PR changes.
2. It gives the browser encrypted, short-lived **tickets**, one per PDF
   (before, after, latexdiff).
3. The browser fetches each PDF straight from the worker with its ticket (so
   large PDFs and slow compiles never pass through Vercel), and draws the
   pages with pdf.js.

Repos with an unusual layout can name their documents in `.texpr.json`:
`{ "main": "paper/main.tex" }` or `{ "main": ["a.tex", "b.tex"] }`.

## Worker API

`GET /pdf?t=<ticket>` is what browsers use (see `PdfTicket` in `packages/shared`).
The other routes, except `/health`, need `Authorization: Bearer $WORKER_SECRET`. Pass the
user's GitHub token (for private repos) as `X-GitHub-Token`.

| Route | Body | Returns |
| --- | --- | --- |
| `POST /build` | `{ revision: { owner, repo, sha }, mainFile }` | the compiled PDF |
| `POST /diff` | `{ base, head, mainFile }` | latexdiff PDF (changes in red/blue) |

Errors are JSON `{ error, message, log? }` (see `packages/shared`). Results are
cached by commit SHA; access to the repo is re-checked on every request, cache
hits included.

## Security model (worker)

Repos are untrusted input. Each compile:

- runs as its own unprivileged user (one per concurrent job) in a folder only that user can open, so it can't read the server's secrets or another job's repo
- has shell escape off; TeX may not write outside the project (reads with `..` are allowed, since templates like McMaster's capstone one use `\input{../Common.text}`)
- never runs a repo's `latexmkrc` (`-norc`, and the files are deleted), and symlinks are deleted after unpacking
- has size caps on the download and the unpacked repo, and a 90s time limit
- can't reach the network through URL-fetching tools (dead proxy)

`test/fixtures/evil*` check these in CI.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.
