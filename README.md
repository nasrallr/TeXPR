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

Worker image (build from the repo root, first build takes ~5 min):

```sh
docker build -f apps/worker/Dockerfile -t texpr-worker .
docker run -p 8080:8080 -e WORKER_SECRET=devsecret texpr-worker
npm run selftest -w @texpr/worker   # compiles the fixtures inside the image
```

## Worker API

All routes except `/health` need `Authorization: Bearer $WORKER_SECRET`. Pass the
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
- has shell escape off; TeX may not write outside the project (reads with `..` are allowed, since templates like McMaster's capstone one `input{../Common.text}`)
- never runs a repo's `latexmkrc` (`-norc`, and the files are deleted), and symlinks are deleted after unpacking
- has size caps on the download and the unpacked repo, and a 90s time limit
- can't reach the network through URL-fetching tools (dead proxy)

`test/fixtures/evil*` check these in CI.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.
