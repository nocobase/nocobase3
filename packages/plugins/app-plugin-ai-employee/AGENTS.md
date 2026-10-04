# AGENTS.md

Development notes for `@nocobase/app-plugin-ai-employee`. The repository root `AGENTS.md` and `packages/app/app-skills/skills/nocobase-app-development/references/http-api.md` apply here as everywhere; this file records only what is particular to this plugin. It is not published: `skills/nocobase-app-plugin-ai-employee/` is what reaches applications.

## HTTP routes

The plugin owns two prefixes under `/api`, and nothing else. The employees themselves live under `/api/aiEmployees` (`GET /api/aiEmployees/{username}`), and every other AI resource — skills, tools, models, LLM services, MCP servers, files, usage and conversations — under `/api/aiEmployee`, without repeating an `ai` prefix: `/api/aiEmployee/skills`, never `/api/aiEmployee/aiSkills`. `server/route/index.ts` mounts both, and its shared middleware is scoped to those two prefixes because the router sits at `/api` beside every other plugin's routes.

Register a fixed segment before the path parameter beside it, as `GET /aiEmployees/roster` and `/aiEmployees/templates` come before `/aiEmployees/:username`: Hono answers with the first registered match. A username equal to such a segment could never be read, so `AI_EMPLOYEE_RESERVED_USERNAMES` in `server/route/schemas.ts` lists them and creating an employee with one is refused. A new fixed segment under `/aiEmployees` goes into that list in the same change; `tests/app/api-routes.test.ts` fails until it does.

Every route names one guard from `AIRouteGuards` as its first handler: `signedIn` for the chat, its files and the non-secret model catalog, `settings` for everything the AI settings page does, including reading every user's conversations and usage. The guard is what readies the services, so nothing initializes for a caller it refuses. `listAIRouteAccess()` reads the guards back off the router, and `tests/app/route-table.ts` is the table it must match, so a new route is added there and placed in one group deliberately.

Inputs are validated with the zod schemas in `server/route/schemas.ts`. Services throw `DomainError` with a `reason`; the router's `onError` turns it into an `ApiError` with domain `aiEmployees` and leaves every other error to `apiErrorHandler`. The run routes (`send`, `resend`, `resumeToolCall`, `resumeStream`) check their input and the conversation before the stream opens; a failure after that is an `error` event on the stream, and its format does not change.
