# NocoBase 3

## Hub Docker image

`Dockerfile.hub` builds a Hub from published packages at `https://npm.nocobase.ai/`. The build creates a fresh application, installs its dependencies, and compiles it. The runtime image contains the compiled application and its production dependencies. It does not include changes from this source checkout.

From the repository root:

```bash
docker build -f Dockerfile.hub -t nocobase-hub .
```

### Build arguments

| Argument               | Default   | Purpose                                                        |
| ---------------------- | --------- | -------------------------------------------------------------- |
| `CREATE_APP_VERSION`   | `latest`  | Version or tag of the `@nocobase/create-app` scaffolding tool. |
| `HUB_TEMPLATE_VERSION` | `latest`  | Version or tag of `@nocobase/app-template-hub`.                |
| `NODE_VERSION`         | `24.15.0` | Node version used by both build and runtime images.            |
| `PNPM_VERSION`         | `11.7.0`  | pnpm version installed in both images.                         |
| `APP_BASE_PATH`        | `/hub`    | Public mount path, shared by the client build and server.      |

For example, select a template version independently from the scaffolding tool:

```bash
docker build -f Dockerfile.hub -t nocobase-hub:custom \
  --build-arg HUB_TEMPLATE_VERSION='<published-version>' \
  --build-arg CREATE_APP_VERSION='<published-create-app-version>' .
```

Versions must exist in the registry. Selecting only `CREATE_APP_VERSION` does not pin the Hub template. Pinning both packages still allows their dependency ranges to resolve newer compatible releases.

Docker may reuse a cached build even when `latest` has changed. To fetch releases again while retaining the pnpm download cache:

```bash
docker buildx build --load --no-cache-filter build \
  -f Dockerfile.hub -t nocobase-hub .
```

Set `APP_BASE_PATH` at build time when a different public path is needed; changing only the container environment would leave the browser assets built for the previous path. For another architecture, use Docker's `--platform` option so the build and runtime use the same target, including native database modules.

### Build with GitHub Actions

Open **Actions → Hub Docker image → Run workflow** to build and publish `ghcr.io/nocobase/hub`. This workflow is manually triggered and builds for both `linux/amd64` and `linux/arm64` using the root `Dockerfile.hub`. Each published tag includes both platforms, so Docker selects the matching image when pulling it. QEMU enables ARM64 builds on the Ubuntu runner.

The `create_app_version`, `hub_template_version`, and `image_tag` inputs all default to `latest`. Each run publishes the selected image tag and a `run-<run-id>-<attempt>` tag for that build. The build stage always resolves registry tags again so a repeated manual run can pick up a new `latest` release.

Publishing uses the repository's `GITHUB_TOKEN` with `packages: write`. If the GHCR package already exists, grant this repository Actions access to that package. The workflow must be present on the repository's default branch for the **Run workflow** button to appear.

### Run

Extract the configuration example from the image you built:

```bash
docker run --rm --entrypoint cat nocobase-hub /app/config.example.yml > hub-config.yml
openssl rand -hex 32
```

Replace both `replace-with-a-unique-secret` values in `hub-config.yml` with the generated secret. Keep this configuration across container replacements. The image does not include the secrets generated during scaffolding. Configure `app.publicOrigin` when deploying behind a reverse proxy, and preserve the public Host and protocol in forwarded requests.

```bash
docker run -d --name nocobase-hub \
  -p 13000:13000 \
  --mount type=bind,src="$(pwd)/hub-config.yml",dst=/app/config.yml,readonly \
  --mount type=volume,src=nocobase-hub-storage,dst=/app/dist/storage \
  nocobase-hub
```

Open `http://localhost:13000/hub/`. The template seeds an administrator with email `admin@nocobase.com` and password `admin123`; change the password after signing in. The server runs as the `node` user and listens on `0.0.0.0:13000`.

The storage volume preserves the Hub database, uploaded application artifacts, deployed applications, application data, and host configuration. If you bind a host directory instead, make it writable by the container's `node` user (UID/GID `1000:1000`). The mounted configuration file must be readable by that user.
