# Skills

This directory holds every Skill this repository commits. `pnpm install` links each of them into `.agents/skills/` and `.claude/skills/`, so agents working in the checkout see them; see "Repository Skills" in the root `AGENTS.md`.

| Skill                                                                 | Who uses it                                        | What it does                                                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`nocobase-create-app`](nocobase-create-app/SKILL.md)                 | Users, installed globally                          | Creates an application with `pnpm create @nocobase/app`, configures it with `nocobase config init`, `config set` and `config check`, and starts it |
| [`nocobase-plugin-development`](nocobase-plugin-development/SKILL.md) | Contributors developing plugins in a NocoBase 3 source workspace, linked by this checkout or installed globally | Scaffolds, implements, registers and verifies a NocoBase 3 plugin |

The rest of this file is about `nocobase-create-app`. It is installed once, globally, so that an agent knows how to reach NocoBase 3 before any application exists. Everything an agent needs after that ships inside the application it creates, under `.agents/skills/`, synchronized from the installed packages.

There are two ways to use it: against the published packages, which is what users do, and against the unreleased checkout, published to a local npm registry, which is how a change is tested before it is released.

## Install from the published packages

Use this to install NocoBase with an agent. The packages come from `https://npm.nocobase.ai/`, and nothing needs to be configured for that first.

### Requirements

- Node.js 24 or later and pnpm 11.
- An agent that loads Skills, such as Claude Code or Codex.

### 1. Install the Skill

```bash
npx skills add nocobase/nocobase3 --skill nocobase-create-app -g
```

`--skill` is required. The `skills` CLI reads this whole directory, and without it would offer `nocobase-plugin-development`, which is for developing plugins in a NocoBase 3 source workspace, alongside this one. That Skill can be installed the same way, `npx skills add nocobase/nocobase3 --skill nocobase-plugin-development -g`, for an agent working in a fork or another checkout; this checkout links it already. Add `-a claude-code`, or another agent's name, to install for one agent only.

Agents load Skills when a session starts, so start a new session after installing.

### 2. Ask the agent

Open the agent in an empty directory and ask for an application, for example:

> Create a NocoBase application in this directory with SQLite, start it, and tell me how to sign in.

The Skill then:

1. Runs `pnpm create @nocobase/app <name> --json` from the parent directory, so the files land in the directory you opened.
2. Follows the `nextCommands` that creation returns: `pnpm nocobase config init`, then `pnpm nocobase config set` for any `requiredSettings` of a database other than SQLite, then `pnpm nocobase config check`, and finally `pnpm dev` in the background.
3. Reports the URL and the first sign-in account, and recommends starting a new session in the application directory, where the application's own Skills are loaded reliably. If you keep working in the same session, it reads the application's `AGENTS.md` and Skills directly instead.

It never asks for a database password in the conversation. For a database other than SQLite it asks you to put the password in an environment variable, then reads it with `pnpm nocobase config set --from-env`.

### Where the packages come from

`@nocobase/create-app` itself is on the public npm. It downloads the template and installs the dependencies from `https://npm.nocobase.ai/`, and writes `@nocobase:registry=https://npm.nocobase.ai/` into the new project's `.npmrc`. A later `pnpm add @nocobase/…` inside the project therefore resolves too. Your own pnpm configuration is not changed, and there is no need to run `pnpm config set @nocobase:registry`.

### Without an agent

The Skill runs nothing you cannot run yourself:

```bash
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm create @nocobase/app my-app
cd my-app
pnpm nocobase config init
pnpm nocobase config check
pnpm dev
```

`PNPM_CONFIG_MINIMUM_RELEASE_AGE=0` lets pnpm install versions published minutes ago. For another database, install its driver, name it, and fill in the connection before `pnpm nocobase config check`:

```bash
pnpm add @nocobase/db-postgres
pnpm nocobase config init --dialect postgres
pnpm nocobase config set database.connections.main.host=db.internal database.connections.main.username=crm
pnpm nocobase config set --from-env database.connections.main.password=CRM_DB_PASSWORD
```

## Install the unreleased checkout

Use this to test a change before it is released: a change to the Skill, or to a package it drives, such as `create-app`, a template or `app-cli`. The checkout is published to a local npm registry on your machine, and a shell is pointed at it, so the Skill's unchanged `pnpm create @nocobase/app` installs the unreleased code.

A global Skill is released by merging it into `develop`, while packages are released by `release-beta`. A change to the Skill that describes new package behavior therefore has to be tried here first, because the published packages cannot show whether it works.

### Requirements

- Everything above, plus Docker, which runs the local npm registry.
- A checkout of this repository with dependencies installed.

### 1. Publish the checkout

From the repository root:

```bash
pnpm unreleased:prepare
```

This builds every publishable package, publishes it to a Verdaccio on `http://127.0.0.1:4873/`, and points each package's `latest` tag at the snapshot. Add `--reset` to replace a previous snapshot. The session lives under `$TMPDIR/nocobase-unreleased-<id>/` and does not depend on which branch is checked out, so switching branches afterwards keeps it usable.

### 2. Link the Skill from the checkout

For Claude Code, link it, so that an edit to `skills/nocobase-create-app/SKILL.md` reaches the next session without reinstalling:

```bash
ln -sfn "$PWD/skills/nocobase-create-app" ~/.claude/skills/nocobase-create-app
```

The link follows the working tree, so it breaks while a branch without the Skill is checked out. For any agent, `npx skills add ./skills/nocobase-create-app -g` installs a copy instead, which has to be repeated after every edit.

### 3. Point a shell at the snapshot

Open a new shell, and from the repository root:

```bash
eval "$(pnpm -s unreleased:env)"
pnpm config get @nocobase:registry
```

The second command must print `http://127.0.0.1:4873/`. `-s` keeps pnpm's own `$ node …` line out of what the shell evaluates.

`unreleased:env` prints the same variables `unreleased:create` and `unreleased:smoke` run with, including a session-only store and cache. Setting a few of them by hand is not enough, and fails silently:

- A snapshot carries the same version numbers as the last release until one is cut. A package resolved from `https://npm.nocobase.ai/` looks identical to pnpm, so a partly configured shell produces an application that mixes a new template with old packages, and nothing reports it. The symptoms are a `config.yml` created before `config init` ran, no `.npmrc`, and a `pnpm nocobase` command reported as not found.
- `pnpm config set @nocobase:registry …` saves the scoped registry to `auth.ini` in pnpm's global configuration directory, `~/Library/Preferences/pnpm` on macOS. `PNPM_CONFIG_USERCONFIG` does not replace that file, and only `XDG_CONFIG_HOME` moves the directory, so the command sets it for the whole shell. Tools that keep their own settings there, such as `gh`, will not find them until you open a new shell.

If the shell uses an HTTP proxy, keep `127.0.0.1` in `NO_PROXY` so the local npm registry is reached directly.

### 4. Ask the agent

In the same shell, create an empty directory outside the repository and start the agent there:

```bash
mkdir -p ~/nb-skill-test/my-app && cd ~/nb-skill-test/my-app && claude
```

Ask for an application exactly as in the published case. A snapshot install can be told apart from a published one:

- There is no `config.yml` until `pnpm nocobase config init` runs.
- `.npmrc` contains `@nocobase:registry=http://127.0.0.1:4873/`.
- `node_modules/@nocobase/app-cli/dist/commands/config/` contains `init.js`, `check.js` and `set.js`.

To look at what the local npm registry serves, query it with `curl`. In a shell without the variables above, a scoped registry in your own configuration overrides `npm view --registry`, and the answer comes from `https://npm.nocobase.ai/` instead:

```bash
curl -s http://127.0.0.1:4873/@nocobase%2fcreate-app
```

Worth covering when the Skill changes:

- The default SQLite path, through to the page opening and the sign-in account being reported.
- A database other than SQLite, with the password supplied through `--from-env`.
- A directory that is not empty, which the Skill must refuse rather than overwrite.
- A directory that already holds an application, where the Skill must hand over to that application's `AGENTS.md`.
- With NocoBase 2 Skills also installed, the agent must choose this one and never run the `nb` CLI.

### Without an agent

`pnpm unreleased:create my-app` creates an application from the snapshot under `../nocobase-local-apps/`, and `pnpm unreleased:smoke` runs the create-app smoke test against it. Both set up the environment themselves.

`pnpm unreleased:hub-smoke` installs a Hub with the snapshot's `@nocobase/hub-installer`, then upgrades and rolls it back, through `scripts/smoke-hub-installer.mjs`, the script the Hub installer CI job runs against the published template. It covers changes to the Hub template, `app-cli`, `app-host` and `create-app` that the CI job cannot see before a release. It needs pm2 on `PATH` and the App Host port 13010 free, runs pm2 under its own `PM2_HOME` and stops it afterwards, and keeps the Hub and its logs under the temporary directory it prints.

### 5. Clean up

```bash
rm ~/.claude/skills/nocobase-create-app
pnpm unreleased:clean
```

`unreleased:clean` removes the local npm registry and its caches, not the applications created from it.
