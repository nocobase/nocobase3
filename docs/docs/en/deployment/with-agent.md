---
title: Deploy with an AI Agent
description: Where the session runs and which Skill applies, the information the Agent needs, prompts for each scenario, and the acceptance criteria.
---

# Deploy with an AI Agent

Every step of a deployment can be carried out by an AI Agent. The application is created with a deployment Skill that the Agent reads automatically. The user states the deployment target, prepares the resources the Agent cannot obtain on its own, and verifies the result.

## Session location and Skill

| Scenario                                | Session location                                                         | Skill the Agent uses                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Publish to a Hub (Professional license) | The application source root                                              | The application's own `nocobase-deployment` and `nocobase-hub-cli`, under `.agents/skills/`                                               |
| Deploy to a server with app-installer   | Two sessions: the source root builds the archive, the server installs it | `nocobase-deployment` on the source side; the globally installed `nocobase-app-installer` on the server                                   |
| Deploy with Docker                      | The source root builds the image; the server runs the container          | `nocobase-deployment`                                                                                                                     |
| Install a Hub (Professional license)    | The server                                                               | The globally installed `nocobase-app-installer`; for a Docker installation the Agent follows the [manual page](./hub#install-with-docker) |

The `nocobase-hub-cli` Skill ships with the `@nocobase/hub-cli` package. The default template depends on it; other templates run `pnpm add -D @nocobase/hub-cli` first.

A server holds no application project, so the server-side Skill is installed globally. Run once on the server:

```bash
npx skills add nocobase/nocobase3 --skill nocobase-app-installer -g
```

An Agent can operate a server in two ways: a session opened on the server itself, or a local Agent running commands over SSH. The former requires less setup; the archive is copied to the server with `scp`.

## Information the Agent needs

- **Deployment method**: Hub, app-installer or Docker.
- **Public address**: for example `https://apps.example.com/crm/`. A Hub address includes the Hub's own mount path, such as `https://apps.example.com/hub`.
- **Runtime environment**: the server's CPU architecture and Node major version. When publishing to a Hub, state how the Hub was installed; a Hub installed with Docker is always Linux glibc with Node 24.
- **Database**: keep the existing database, create an empty one, or restore from a backup.
- **Operation**: first deployment, update, rollback or recovery.

Credentials are not written into the conversation. Database passwords and Hub API keys are kept in the project's `.env` or in environment variables on the server, and the Agent is told where they are. The deployment Skill requires the Agent not to print secrets and not to write them into the repository.

## Prompts

The prompts below can be used after replacing the addresses and names. Each one asks the Agent to state the commands it will run and to provide a deployment report on completion; these two items are the basis for acceptance.

### Publish to a Hub

In the application source root, with the API key already in `.env`:

```text
Publish this application to the Hub at https://apps.example.com/hub. The app ID is crm, and the Hub was installed with Docker.
This is the first deployment. Use PostgreSQL; the database has been created and the connection settings are in runtime.yml in the project root. HUB_API_KEY is in .env.
Tell me the commands you will run first, and give me a deployment report when done.
```

Update an application already running on the Hub:

```text
Build a new version and publish it to the crm app on the Hub, keeping the current runtime configuration. Before publishing, check whether this change includes database migrations; if it does, remind me to back up before continuing. Give me a deployment report when done.
```

Roll back:

```text
The version just published to the crm app is faulty. Roll back to the previous successful deployment. List the candidate Releases with their deployment times for my confirmation before running anything.
```

### Deploy to a server with app-installer

Build the archive in the source root first. For a Linux x64 server running Node 24:

```text
Build this application's deployment archive for a Linux x64 server running Node 24, using PostgreSQL. When the build completes, tell me where the file is and the scp command to copy it to the server.
```

After copying the archive to the server, open a session there:

```text
Use app-installer to install /tmp/crm.tar.gz into /srv/nocobase/crm. The public origin is https://apps.example.com, the base path is /crm, and the port is 13000.
The database is PostgreSQL on db.internal; the database name and user are both crm, and the password is in the CRM_DB_PASSWORD environment variable.
When the installation completes, tell me the sign-in URL, the initial administrator account, and how to configure the reverse proxy.
```

Upgrade:

```text
Upgrade the application in /srv/nocobase/crm with /tmp/crm.tar.gz. Tell me the downtime and the backup scope first, and wait for my confirmation before running it.
```

### Deploy with Docker

In the application source root:

```text
Build a linux/amd64 image with the project's Dockerfile, tagged crm:release-001. Then write a compose.yml: public origin https://apps.example.com, base path /crm, the port exposed only on 127.0.0.1:13000, config.yml mounted read-only, and storage mounted from ./storage.
```

On the server, with the image and deployment directory prepared:

```text
Start crm with docker compose in /srv/nocobase/crm. Check config.yml with the image's config check before starting, then check the health check and the logs, and report the results.
```

### Install a Hub

On the server:

```text
Use app-installer to install the latest Hub into /srv/nocobase/hub on this server, with the public origin https://apps.example.com and SQLite. When the installation completes, tell me the sign-in URL, the initial administrator account, and how to configure Nginx.
```

## Acceptance

The deployment report must include the following; ask the Agent to supply any item that is missing:

- The deployed version and the identifier of the archive or image.
- The result of database migrations and seed tasks.
- The response from the health check at `<base path>/api/healthz`.
- Signing in as the administrator, creating a test record and uploading a file, with both still present after a service restart.
- Any check that was skipped, and the reason.

A running process does not mean a usable application. After receiving the report, open the public address and sign in.

## Operations that require the user

The deployment Skill requires the Agent to pause and wait for confirmation in the following cases:

- **Operations that need sudo**: installing a global pm2, running the command printed by `pm2 startup`, editing the Nginx configuration. The Agent provides the command and the user runs it.
- **Downtime confirmation**: an app-installer upgrade or rollback stops the application, and a Hub upgrade also stops every application it hosts. The Agent states the impact first and waits for explicit agreement.
- **Backups of external databases**: app-installer backs up SQLite only. With PostgreSQL, MySQL or another external database, the Agent asks for a backup to be completed first.
- **Credentials**: the Agent does not create a Hub API key on the user's behalf and does not guess passwords; it states where the key is created and which file holds it.
