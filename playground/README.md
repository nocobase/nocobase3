# Hub playground

Run the published NocoBase Hub image with SQLite and a named volume for the Hub database, application artifacts, deployments, application data, and host configuration. This directory has its own `.env` and editable `config.yml`. Run the following commands from `playground/`.

## Start

Copy `.env.example` to `.env`, preserving an existing file. Generate two secrets and fill in `AUTH_SECRET` and `SESSION_SECRET` before starting:

```bash
cp -n .env.example .env
openssl rand -hex 32
openssl rand -hex 32
# Edit .env and paste the generated values into AUTH_SECRET and SESSION_SECRET.
docker compose config --quiet
docker compose pull
docker compose up -d --wait
docker compose logs -f hub
```

Open <http://localhost:13000/hub/> and sign in with `admin@nocobase.com` / `admin123`. Change the password after signing in. Compose requires both secrets to be nonempty; keep them unchanged across restarts and image updates.

## Select an image

The default image is `ghcr.io/nocobase/hub:latest`. To use Alibaba Cloud, set this in `.env`:

```dotenv
NOCOBASE_IMAGE=registry.cn-beijing.aliyuncs.com/nocobase/hub:latest
```

The manual [Hub image workflow](../.github/workflows/docker-hub.yml) publishes both `linux/amd64` and `linux/arm64` under the same tag. Compose lets Docker select the host's architecture. Use a published `run-<run-id>-<attempt>` tag or digest to pin a specific build.

If pulling a private image returns `unauthorized`, log in to its registry with an account that can read `nocobase/hub`: `docker login ghcr.io` or `docker login registry.cn-beijing.aliyuncs.com`. Public images support anonymous pulls. GitHub Actions publishing secrets are separate from local Docker credentials.

To try a local build before publishing, run this from the repository root:

```bash
docker build -f Dockerfile.hub -t nocobase-hub:local .
```

Then set `NOCOBASE_IMAGE=nocobase-hub:local` in `playground/.env` and run `docker compose up -d --wait --pull never` from `playground/`.

## Configuration

Edit `config.yml` for Hub settings such as its title, language, appearance, and database configuration. Compose mounts the file read-only at `/app/config.yml` and sets `APP_CONFIG_FILE` to that path. The file must exist and be readable by the image's `node` user (UID 1000). Authentication and session secrets stay in the gitignored `.env`; Compose passes them to the container as environment variables, which override the configuration file.

| Variable                        | Purpose                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `NOCOBASE_IMAGE`                | Hub image from GHCR, Alibaba Cloud, or a local build.                          |
| `NOCOBASE_BIND_HOST`            | Defaults to `127.0.0.1`; use `0.0.0.0` to expose the port on other interfaces. |
| `NOCOBASE_PORT`                 | Host port, default `13000`.                                                    |
| `APP_PUBLIC_ORIGIN`             | Browser-facing origin without `/hub`; update when changing the port or domain. |
| `AUTH_SECRET`, `SESSION_SECRET` | Stable random secrets generated before first startup.                          |

The published image uses `/hub`. Changing only a runtime environment variable cannot relocate the built client; build a new image with `APP_BASE_PATH` if a different path is needed. For a reverse proxy, set the public HTTPS origin and preserve the public Host and protocol in forwarded requests.

After editing `.env` or `config.yml`, recreate the container to load the new configuration, including when an editor replaces the mounted file during an atomic save:

```bash
docker compose up -d --force-recreate --wait
```

The [Hub configuration example](../packages/templates/app-template-hub/config.example.yml) documents additional application settings. A variable referenced by a configuration setting must also be passed through the service's `environment` section; Compose's `.env` file alone does not inject every value into the container.

## Update and stop

```bash
docker compose pull
docker compose up -d --wait
docker compose down
```

The named volume at `/app/dist/storage` survives container replacement and `docker compose down`. Adding `--volumes` deletes the Hub database and all stored artifacts, deployments, and application data. The project name is `nocobase-hub`; use a separate project name and host port for each independent playground.
