---
title: 'Create an application manually'
description: 'Prepare the environment, create a NocoBase 3 project, and start it from the terminal.'
---

# Create an application manually

You can create and start the application directly in your terminal. To delegate these steps, see [Create with an AI Agent](./create-app). Choose either approach.

## Check your environment

Install Node.js 24 and pnpm 11, then check that both are available:

```bash
node --version
pnpm --version
```

After generation, use the pnpm version specified by the project's `package.json`. The commands below run in a Linux or WSL terminal; Windows users can follow this walkthrough in WSL.

## Create the project

For manual creation, run the command from the application directory’s parent. This example uses an empty directory named `my-app`:

```bash
# Configure the internal registry
pnpm config set @nocobase:registry https://npm.nocobase.ai/
# Allow newly published versions and create the application
PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm create @nocobase/app my-app
```

`my-app` is the target directory name and becomes the application's default name. The name must start with a lowercase English letter or digit and contain only lowercase English letters, digits, dots (`.`), hyphens (`-`), or underscores (`_`). Chinese characters, spaces, and uppercase letters are not allowed. Suggested names include `my-app`, `crm-demo`, and `order-system`. The target can be absent or an existing empty directory.

The command downloads the template, generates the project and configuration, installs dependencies, and synchronizes plugin development guidance. Wait for completion before continuing.

The first command configures the internal registry for `@nocobase` packages. The second sets `minimumReleaseAge` to `0` for this creation process so it can download newly published versions.

Once the package is officially published to the public npm registry, the creation command will simply be:

```bash
pnpm create @nocobase/app my-app
```

The generated `config.yml` contains application configuration and secrets. Keep it local and out of version control.

## Check database configuration

Before startup, check the drivers registered in `server/config/database.ts` and the connection settings in `config.yml`. If you keep the generated database configuration, you do not need to configure it again.

To use another database, install the matching `@nocobase/db-*` package, register it in `drivers`, and configure the connection address, database name, and account details. Keep connection passwords in local configuration.

## Start the application

Enter the new directory and start development:

```bash
cd my-app
pnpm dev
```

Leave the terminal running and open its printed `Local` URL. For example, `http://127.0.0.1:13000/main/`. If a port is occupied, the address can change; use your own terminal output.

## Sign in

The browser opens the sign-in page:

![Sign-in page of a new application](https://static-docs.nocobase.com/nb3-docs-20260916-login-en.png)

When using the template’s initial administrator, the credentials are:

| Field    | Initial value        |
| -------- | -------------------- |
| Email    | `admin@nocobase.com` |
| Password | `admin123`           |

Use this account for the first local walkthrough. Change the initial password and configure production access before exposing the application. If you configured your own administrator during installation or connected an existing database, use those credentials.

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

Start an AI Agent session in the generated application directory, ask it to read `AGENTS.md` and the relevant development guidance, then [build your first feature](./first-feature).
