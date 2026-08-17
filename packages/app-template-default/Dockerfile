# This Dockerfile uses `serve` npm package to serve the static files with node process.
# You can find the Dockerfile for nginx in the following link:
# https://github.com/refinedev/dockerfiles/blob/main/vite/Dockerfile.nginx
FROM refinedev/node:18 AS base

FROM base as deps

RUN corepack enable

COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --frozen-lockfile

FROM base as builder

ENV NODE_ENV production

COPY --from=deps /app/refine/node_modules ./node_modules

COPY . .

RUN pnpm run build

FROM base as runner

ENV NODE_ENV production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && pnpm add --global serve

COPY --from=builder /app/refine/dist ./

USER refine

CMD ["serve"]
