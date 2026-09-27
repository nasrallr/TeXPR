# Compile worker: Node + a TeX Live subset big enough for most papers and
# assignments (texlive-full is ~5GB; this is ~2GB).
# Build from the repo root so workspace packages resolve:
#   docker build -f apps/worker/Dockerfile -t texpr-worker .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/worker/package.json ./apps/worker/
RUN npm ci -w @texpr/worker --include-workspace-root=false --no-audit --no-fund
COPY apps/worker ./apps/worker
# Bundles the server and its dependencies into one file.
RUN npm run build -w @texpr/worker

FROM node:22-bookworm-slim
# Keep this layer unchanged where possible: it's the slow one.
RUN apt-get update && apt-get install -y --no-install-recommends \
      latexmk latexdiff biber \
      texlive-latex-base texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended texlive-fonts-extra texlive-science \
      texlive-bibtex-extra texlive-pictures texlive-xetex texlive-luatex \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# ulem (latexdiff's markup), babel language files, scalable CM fonts, pdftotext.
RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-plain-generic texlive-lang-english texlive-lang-european cm-super-minimal \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Compiles run as this user. It owns nothing but its own job folder and
# can't read the server's environment (where the secrets are).
RUN groupadd --gid 10001 sandbox \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin sandbox

WORKDIR /app
COPY --from=build /repo/apps/worker/dist/index.js ./index.mjs

# The server starts as root only so it can drop to the sandbox user for each
# compile; it runs no repo content itself.
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/var/lib/texpr \
    SANDBOX_UID=10001 \
    SANDBOX_GID=10001
EXPOSE 8080
CMD ["node", "index.mjs"]
