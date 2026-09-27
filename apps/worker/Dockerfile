# Compile worker: Node + a TeX Live subset big enough for most papers and
# assignments (texlive-full is ~5GB; this is ~1.5GB).
# Build from the repo root so workspace packages resolve:
#   docker build -f apps/worker/Dockerfile -t texpr-worker .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/worker/package.json ./apps/worker/
RUN npm ci -w @texpr/worker --include-workspace-root=false --no-audit --no-fund
COPY apps/worker ./apps/worker
RUN npm run build -w @texpr/worker \
    && npm prune --omit=dev -w @texpr/worker

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      latexmk latexdiff biber \
      texlive-latex-base texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended texlive-fonts-extra texlive-science \
      texlive-bibtex-extra texlive-pictures texlive-xetex texlive-luatex \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/worker/dist ./dist
COPY apps/worker/package.json ./
# Never compile as root.
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
