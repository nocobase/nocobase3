# syntax=docker/dockerfile:1
#
# Builds this application from its own sources into a production image.
#
# In a generated application, run from the project root:
#
#   docker build -t my-app .
#
# In the nocobase3 repository, the build context has to be the repository root, because the template resolves its
# `workspace:` dependencies from there:
#
#   docker build -f packages/templates/app-template-default/Dockerfile \
#     --build-arg APP_DIR=packages/templates/app-template-default -t my-app .
#
# The image holds code and production dependencies only. Mount the runtime configuration at /app/config.yml and
# persistent data at /app/storage; neither belongs in the image.

ARG NODE_VERSION=24.15.0

# The build runs on the builder's own architecture and cross-targets the image platform through `pnpm build --target`,
# which fetches the matching native binaries. Building under emulation would compile every TypeScript package and the
# client bundle there too, many times slower, while only the `.node` files actually differ between platforms.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm AS build
ARG PNPM_VERSION=11.7.0
RUN npm install --global pnpm@${PNPM_VERSION} \
    && pnpm config set store-dir /pnpm/store

# `.` in a generated application; the template's directory when building inside the nocobase3 repository.
ARG APP_DIR=.
WORKDIR /src
COPY . .
# Installs this application and the workspace packages it depends on, and nothing else in the repository. The
# application is selected by its package name, which in a generated application is simply the root project.
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "$(node -p "require('./${APP_DIR}/package.json').name")..."
# `pnpm build` typechecks and bundles the client before it builds the workspace packages the server needs, so on a
# clean checkout their `dist` has to exist first. In a generated application nothing matches and this does nothing.
RUN pnpm --filter "$(node -p "require('./${APP_DIR}/package.json').name")^..." build

WORKDIR /src/${APP_DIR}
# The public mount path is compiled into the client, so it is fixed when the image is built.
ARG APP_BASE_PATH=/main
ARG TARGETARCH
RUN --mount=type=cache,target=/pnpm/store \
    case "${TARGETARCH}" in \
      amd64) target=linux-x64 ;; \
      arm64) target=linux-arm64 ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && APP_BASE_PATH="${APP_BASE_PATH}" NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD=1 \
      pnpm build --target "${target}" --node-version "$(node -p "process.versions.node.split('.')[0]")"

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG APP_DIR=.
ARG APP_BASE_PATH=/main
ENV NODE_ENV=production \
    APP_BASE_PATH=${APP_BASE_PATH} \
    APP_SERVER_HOST=0.0.0.0 \
    APP_SERVER_PORT=13000 \
    APP_CONFIG_FILE=/app/config.yml

# The runtime takes the directory above `dist` as its deployment root, so storage resolves to /app/storage.
WORKDIR /app
COPY --from=build --chown=node:node /src/${APP_DIR}/dist/ ./dist/
# Kept as a starting point for config.yml; the real file, with its secrets, is supplied at runtime.
COPY --from=build /src/${APP_DIR}/config.example.yml ./config.example.yml
RUN mkdir -p storage && chown node:node storage
USER node
EXPOSE 13000
# The image has no curl, so the check uses Node's fetch against the application's health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.APP_SERVER_PORT}${(process.env.APP_BASE_PATH || '').replace(/\\/+$/, '')}/api/healthz`, { signal: AbortSignal.timeout(3000) }).then(async (r) => process.exit(r.ok && (await r.json()).ok === true ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/server/standalone.js"]
