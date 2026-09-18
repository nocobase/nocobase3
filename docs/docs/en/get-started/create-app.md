---
title: 'Create an application'
description: 'Create a NocoBase 3 application with pnpm, start on SQLite by default, and run it locally.'
---

# Create an application

Generate an independent project and run it locally. Start with SQLite so you do not need a separate database server.

## Prepare your environment

Install Node.js 24 and pnpm 11, then check that both are available:

```bash
node --version
pnpm --version
```

After generation, use the pnpm version specified by the project's `package.json`. The commands below run in a Linux or WSL terminal; Windows users can follow this walkthrough in WSL.

## Create the project

From the directory where you keep your applications, run:

```bash
npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app docs-demo
```

`docs-demo` is the new directory name. Replace it if needed, and give each application its own directory. Do not overwrite an existing project.

The command downloads the template, generates the project and configuration, installs dependencies, and synchronizes plugin development guidance. Wait for completion before continuing.

The package currently comes from the NocoBase registry, so keep the `npm_config_registry` prefix. If another registry cannot find `@nocobase/create-app`, check this setting first.

The generated `config.yml` includes configuration and secrets for this application. Keep it local and out of version control. The generated SQLite configuration starts without further changes; data stays in the application's own storage directory.

SQLite is the default and needs no separate database server. To use another database, add the matching `@nocobase/db-*` package (for example `@nocobase/db-postgres`) and register it in `drivers` in `server/config/database.ts`; the dialect is declared by the application's source, while `config.yml` carries the connection details.

## Start the application

Enter the new directory and start development:

```bash
cd docs-demo
pnpm dev
```

Leave the terminal running and open its printed `Local` URL. For example, `http://127.0.0.1:13000/main/`. If a port is occupied, the address can change; use your own terminal output.

The browser opens the sign-in page:

![Sign-in page of a new application](https://static-docs.nocobase.com/nb3-docs-20260916-login-en.png)

The template creates an initial administrator in a new database:

| Field    | Initial value        |
| -------- | -------------------- |
| Email    | `admin@nocobase.com` |
| Password | `admin123`           |

Use this account for the first local walkthrough. Change the initial password and configure production access before exposing the application. Accounts in an existing database depend on its actual settings.

After signing in, you see the application home page. Use “Language” in the account menu at the top right to switch languages.

![Application home, with the order menu added by the next step; interface shown in Chinese](https://static-docs.nocobase.com/nb3-docs-20260916-home-cn.png)

The order menu shown here is added on the next page. A newly created application does not have it yet.

## Stop and restart

Press `Ctrl+C` in the running terminal to stop. Next time, enter the same application directory and run `pnpm dev` again. You do not need to recreate the project or its database.

Use `pnpm dev` during development. `pnpm build` followed by `pnpm start` runs a built application; keep development mode for this walkthrough.

## Troubleshooting

- **The directory already exists:** choose another name or continue inside the existing project. Do not delete an existing application just to retry.
- **Dependency installation did not finish:** inspect the terminal error. If the project was generated, fix the issue inside it, rerun `pnpm install`, then run `pnpm skills:sync`.
- **The URL does not open:** check that the terminal is still running and use its printed address. A browser on another machine requires appropriate port access.
- **Type checking reports two versions of the same package:** check the dependency tree for multiple versions of the package. Run `pnpm dedupe` to merge compatible duplicate dependencies, then run type checking again.

## Next step

Open this project directory with an AI Agent you have already configured. Ask it to read `AGENTS.md` and the relevant project guidance, then [build your first feature](./first-feature). The AI Agent's installation, account, and model access must be prepared separately.
