# @nocobase/create-hub

Create a standalone NocoBase Hub from the published production package.

```bash
pnpm config set @nocobase:registry https://npm.nocobase.ai/
pnpm create @nocobase/hub my-hub
cd my-hub
pnpm start
```

`pnpm create @nocobase/hub` resolves this package as `@nocobase/create-hub` and forwards everything after the package name to it.

## Options

| Option         | Description                                                                           |
| -------------- | ------------------------------------------------------------------------------------- |
| `[directory]`  | Directory to create, relative to the current directory. Prompted for when omitted.    |
| `--no-install` | Create the Hub without installing dependencies.                                       |
| `--template`   | Published Hub package or local package directory. Defaults to `@nocobase/hub@latest`. |
| `--registry`   | Registry used to download the Hub and install its dependencies.                       |
| `-h`, `--help` | Show help.                                                                            |
| `--version`    | Show the package version.                                                             |

Every input is available without an interactive prompt:

```bash
pnpm create @nocobase/hub my-hub --no-install
pnpm create @nocobase/hub my-hub --template=@nocobase/hub@0.0.1-beta.3
```

For local development, point `--template` at an already built Hub package:

```bash
pnpm --filter @nocobase/hub build
node ./packages/create-hub/bin/run.js my-hub \
  --template=./packages/hub/dist \
  --no-install
```

The generated `.env.local` uses `127.0.0.1:13000` for Hub and `127.0.0.1:3000` for its local App Host. Edit that file before exposing Hub through another host, port, or public origin.

The generated project contains the published Hub production client and server, so it does not need a build step. `pnpm start` runs it directly.
