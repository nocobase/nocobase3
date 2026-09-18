---
title: 'AI Agent application creation guide'
description: 'Instructions for an AI Agent to initialize a NocoBase 3 application in the current directory, configure it, and start it.'
---

# AI Agent application creation guide

Use this guide to create or start a **single NocoBase 3 application**. By default, initialize it in the user's current empty directory and continue configuration and startup in the same session. Continue existing applications without recreating them.

## 1. Confirm the current directory

Confirm that the current working directory is the empty directory where the user wants the application. Use it directly rather than adding another `my-app` subdirectory. Its name becomes the application name: it must start with a lowercase letter or digit and contain only lowercase letters, digits, dots, dashes, or underscores.

If it already contains the application, read its guidance and continue. If it contains other files or has an invalid name, explain the issue and ask the user to choose an appropriate empty directory. Do not overwrite files or relocate the project yourself.

## 2. Check the environment and create the project

Check Node.js 24 and pnpm 11. If a tool is missing or incompatible, explain what is needed and prepare the environment for the user's operating system before continuing. After generation, use the package manager version specified in the project's `package.json`.

These commands are for Bash on Linux or WSL. Suppose the session's directory is `/work/my-app`, which already exists and is empty. Check the environment and configure the registry, then run creation from `/work` with `my-app` as the target. Substitute the actual path and name.

The creation tool does not accept `.` as an application name. Running it from the parent with the current directory's name generates files directly into the empty directory. Do not create a nested project and move its files afterward.

```bash
node --version
pnpm --version
pnpm config set @nocobase:registry https://npm.nocobase.ai/
(cd /work && PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm create @nocobase/app my-app)
```

The `@nocobase` packages currently use the internal registry. `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0` applies to this command and its child processes, allowing newly published versions. Use the scoped registry setting above. If using an environment variable instead, pnpm 11 uses `pnpm_config_registry`, not `npm_config_registry`.

Once officially published to the public npm registry, use `pnpm create @nocobase/app my-app`. Do not switch to NocoBase 2 installation instructions when a package is unavailable on the public registry.

Wait for creation to finish and check project generation, dependency installation, and development guidance synchronization. Explain and resolve failed steps; an existing directory alone does not mean creation succeeded. Do not recreate the same project.

## 3. Continue in the current session

The subshell changes the directory only for the creation command; the session remains rooted in the application directory. After creation, explicitly read the generated `AGENTS.md` and relevant development guidance, then continue configuration. Do not require a new session or assume that new instructions loaded automatically.

Only when the user explicitly chooses a different application directory should you provide its path and ask them to end the current session, enter that directory, and start a new session. In a desktop client, open or create a project based on that directory and start a new session.

## 4. Confirm the database and configuration

Confirm that the working directory is the application root. Read `AGENTS.md`, `package.json`, and relevant local development guidance. Inspect existing configuration and continue unfinished work.

Ask which database the user wants; do not choose it for them in the initial creation prompt. Common options include SQLite, PostgreSQL, and MySQL. SQLite uses a local file; PostgreSQL and MySQL require a reachable database service. For other databases, consult the project's current database guidance for the driver and connection requirements.

After the user chooses, inspect the registered drivers in `server/config/database.ts` and connection settings in `config.yml`. Install and register the appropriate driver and configure the connection following project guidance. A dialect name in configuration does not register a driver. Preserve existing business data; do not delete a database or configuration file to trigger installation again.

Let the user enter database passwords in local configuration or an available installation interface. Do not require passwords in the conversation or print complete configuration files. If the application opens an installation interface, follow its actual fields and restart instructions. Do not assume all generated projects have identical database or administrator setup screens, or invent an `install` command.

## 5. Start the application and provide sign-in instructions

Start the development service from the application root using its project script:

```bash
pnpm dev
```

Keep the service running, inspect the actual URL in its output, and confirm that the page opens. Complete required installation or configuration before checking the sign-in page. A reachable installation page alone does not mean initialization is complete.

Provide the user with:

- The application directory and actual URL
- The account to use for first sign-in and where to obtain its password
- How to stop and restart the service
- Any remaining configuration tasks or startup errors

If the template uses its initial administrator, the account is `admin@nocobase.com` with password `admin123`; confirm this against the generated project's account guidance before presenting it. If the user configured an administrator or connected an existing database, use the actual account information instead of assuming the defaults. Do not repeat user-defined passwords in the conversation.

Remind the user to change the template's initial password after first sign-in. Continue in the current application session with [your first feature](./first-feature).
