# @nocobase/app-plugin-system-info

Expose a small, read-only system information surface in a NocoBase v3
application.

## Public surfaces

- Client page: `/system-info`
- Server API: `GET /api/system-info`
- Server contract: `@nocobase/app-plugin-system-info/server/tokens`

The page and API require an authenticated application session.

The API returns the plugin package name and version, the current Node.js
version, and the server time. It does not read environment variables, database
records, credentials, or other sensitive application state.

Register the plugin with a target source-workspace application:

```bash
pnpm plugin:register system-info --app app-template-default
```

Registration adds the Client and Server definitions to the target
application's explicit composition roots and synchronizes the plugin-owned
Skill from `skills/` to the application's `.agents/skills/` directory.
