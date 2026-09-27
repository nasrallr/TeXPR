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

Needs Node 22+.

```sh
npm install
npm run dev:web      # http://localhost:3000
npm run dev:worker   # http://localhost:8080/health
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the GitHub
OAuth credentials.

Worker image (build from the repo root):

```sh
docker build -f apps/worker/Dockerfile -t texpr-worker .
docker run -p 8080:8080 texpr-worker
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.
