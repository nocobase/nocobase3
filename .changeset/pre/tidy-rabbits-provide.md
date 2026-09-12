---
'@nocobase/app-server': patch
'@nocobase/db': patch
'@nocobase/app-template-default': patch
'@nocobase/app-plugin-authorization': patch
'@nocobase/app-plugin-install': patch
'@nocobase/app-plugin-queue-example': patch
'@nocobase/app-plugin-realtime-example': patch
'@nocobase/app-plugin-routes-example': patch
'@nocobase/app-plugin-authentication': patch
'@nocobase/caching': patch
'@nocobase/drive': patch
'@nocobase/snowflake': patch
'@nocobase/logging': patch
'@nocobase/queue': patch
'@nocobase/service-provider': patch
'@nocobase/session': patch
---

Add a framework-neutral service provider lifecycle in the new `@nocobase/service-provider` package and use its register, boot, start, ready, and shutdown phases to manage the default application's database access, repositories, logging, caching, ID generation, session, drive, authentication, authorization, queue, and realtime services. Introduce a NocoBase Application class with normalized app name and public base path getters, default Realtime WebSocket handling, and an application-local `/ws` endpoint; let Application instantiate Provider classes with an internally managed context and type-safe Provider arguments; register the Hono HTTP router as a service instead of treating it as the application; pass the shared Application surface directly to core and plugin route registrars; keep AppRuntime limited to resolved configuration and paths; let DatabaseProvider own database creation, automatic migrations and seeds, and shutdown; let CachingProvider and IdGeneratorProvider read their configuration directly from AppRuntime; add application-level Snowflake worker and epoch configuration; and add short-lived database task runners for the migrate and seed commands. Publish shared database, authentication, authorization, queue, and realtime service tokens; move database, caching, drive, ID generator, logging, queue, and session providers and tokens into their capability packages; move Authentication and Authorization providers into their owning plugins with explicit server manifest entries; let Authentication and Authorization resolve public capability tokens directly; remove dependency and repository aggregation facades; and replace server plugin bootstrap functions with convention-based `server/provider.ts` ServiceProvider classes.
