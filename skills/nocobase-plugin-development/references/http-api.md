# HTTP API rules for plugins

Every route a plugin contributes with `defineApiRoutes()` follows these rules. They are Google's API design guidelines with custom methods separated by a slash, `/workflows/{workflowId}/enable`, instead of a colon. The application-level source of truth is `packages/app/app-skills/skills/nocobase-app-development/references/http-api.md`; this page applies it to plugin development. Root routes from `defineRootRoutes()` answer whatever their protocol requires, such as a payment provider's webhook, and are not bound by these rules.

## Paths

- **Every segment is camelCase.** `/apiKeys`, never `/api-keys` or `/api_keys`. Collections are plural nouns.
- **Every route starts with the plugin's namespace:** the package name without `app-plugin-`, in camelCase, in its singular or plural form. All of the plugin's resources live under that one namespace.
- **When the main resource has the plugin's name, the segment appears once.** The users plugin serves `/users` and `/users/{userId}/disable`, never `/users/users`. The workflow plugin serves `/workflows`, `/workflows/{workflowId}/enable`, `/workflows/runs` and `/workflows/runs/{runId}/nodeRuns`.
- **When the resource word differs, it follows the namespace.** The scheduler plugin serves `/scheduler/schedules`; `@nocobase/app-plugin-notification-in-app` serves `/notificationInApp/...`.
- **A plugin mounted through another plugin's dispatcher keeps the host's namespace.** The authorization rule plugins are registered with `authz.routes.add` and answer under `/authorization/defaultAccess`, `/authorization/sharingRules` and `/authorization/restrictionRules`; their errors use the domain `authorization`.
- **`/auth`, `/healthz` and `/swagger` are reserved** for Better Auth, the health check and the API documentation.
- **Register fixed segments before path parameters.** Hono matches in registration order and the first match wins silently, so `/workflows/runs` goes before `/workflows/:workflowId`. A user-chosen id must never equal a fixed sibling segment: reject it at creation with `400 INVALID_ARGUMENT` and a field violation, as the AI employee plugin rejects an employee named `skills`.
- **Do not repeat `/api`** or a deployment base path in the source path; the runtime adds both.

## Methods

| Operation                         | Method   | Path                         | Success                  |
| --------------------------------- | -------- | ---------------------------- | ------------------------ |
| List                              | `GET`    | `/orders`                    | `200 { data: [], meta }` |
| Get one                           | `GET`    | `/orders/{orderId}`          | `200 { data }`           |
| Create                            | `POST`   | `/orders`                    | `201 { data }`           |
| Update some fields                | `PATCH`  | `/orders/{orderId}`          | `200 { data }`           |
| Replace a singleton configuration | `PUT`    | `/orders/configuration`      | `200 { data }`           |
| Delete                            | `DELETE` | `/orders/{orderId}`          | `204`, no body           |
| Custom method on one resource     | `POST`   | `/orders/{orderId}/cancel`   | `200 { data }` or `202`  |
| Custom method on a collection     | `POST`   | `/orders/archiveCompleted`   | `200 { data }` or `204`  |

- A custom method is a camelCase verb or verb + noun with no preposition (`/send` with `{ userId }`, not `/sendToUser`) and never `get`, `list`, `create`, `update` or `delete`. Paired operations take paired verbs: `/enable` and `/disable`.
- One operation has exactly one URL. Remove a second route that does the same thing.
- `GET` never changes data. Marking a message read when a list opens is a separate `POST` custom method.
- `DELETE` carries no body; a confirmation is `?confirm=true`.

## Responses

A success is `{ data }` and a list is `{ data: [...], meta }`. Never answer a bare array or object. A list pages one of two ways: `page` and `pageSize` with `meta: { page, pageSize, total }` for administrative tables, or `pageSize` and `pageToken` with `meta: { nextPageToken }` for feeds, logs and inboxes. `pageSize` defaults to 20 and is capped at 100; a route that needs a larger cap says why in a comment. Search is `q`, ordering is `orderBy`. Ids are strings, times are RFC 3339 strings, and field names are camelCase.

## Errors

Throw `ApiError` from `@nocobase/app-server/router`; never write an error body by hand.

```ts
import { ApiError } from '@nocobase/app-server/router';

throw new ApiError({
  status: 'NOT_FOUND',
  reason: 'ORDER_NOT_FOUND',
  domain: 'orders',
  message: `Order ${orderId} was not found.`,
});
```

The application renders it as `{ error: { code, status, reason, domain, message, requestId } }`, with optional `localizedMessage`, `fieldViolations` and `metadata`. `domain` is the plugin's namespace exactly as its URLs spell it. `reason` is UPPER_SNAKE_CASE, unique within the domain and stable once released; keep an existing reason when you change a route. Facts a client needs about the failure, such as an upload offset, go in `metadata`.

| `status`              | HTTP | Use for                                                   |
| --------------------- | ---- | --------------------------------------------------------- |
| `INVALID_ARGUMENT`    | 400  | The request is malformed or a field is invalid            |
| `FAILED_PRECONDITION` | 400  | The request is valid, but the resource's state forbids it |
| `UNAUTHENTICATED`     | 401  | No valid session or API key                               |
| `PERMISSION_DENIED`   | 403  | Not allowed                                               |
| `NOT_FOUND`           | 404  | Allowed, but the resource does not exist                  |
| `ALREADY_EXISTS`      | 409  | Creating something that already exists                    |
| `ABORTED`             | 409  | A concurrent change, idempotency or offset conflict won   |
| `RESOURCE_EXHAUSTED`  | 429  | A rate limit or quota                                     |
| `UNAVAILABLE`         | 503  | A dependency is down; retrying later may succeed          |

`413` and `415` are the only statuses outside the table, both an `INVALID_ARGUMENT` with `httpStatus: 413` or `httpStatus: 415`. There is no `422` (use `INVALID_ARGUMENT` or `FAILED_PRECONDITION`) and no `502` (use `UNAVAILABLE`). `500 INTERNAL` is never thrown on purpose; the application answers an unexpected error with it.

Which resource is missing decides the status. The resource the URL names is missing: `404 NOT_FOUND`, never a 400 or 500. A resource the body or query refers to is missing: `400 INVALID_ARGUMENT` with a `fieldViolations` entry naming the field. Check permission before existence, so a caller without access gets `403` whether the resource exists or not.

A router's own `onError` may only turn the plugin's own domain errors into `ApiError`, and hands everything else to `apiErrorHandler` from `@nocobase/app-server/router`: it renders what the framework recognizes — `ApiError`, `HTTPException`, an error carrying a 4xx `status` such as `AuthorizationDeniedError`, and a Repository error the caller can act on — and rethrows the rest. Use it even though the application would render the same errors: a router tested on a bare Hono has no `/api` handler, and its tests should still see the standard body. Never translate a Repository error yourself; let it propagate.

## Input

Validate every path parameter, query and JSON body with zod through `validator()` from `hono/validator` and `parseApiInput()` from `@nocobase/app-server/router`, and read input only through `context.req.valid(...)`. A JSON body uses `z.strictObject`, so an unknown field is rejected; query and path parameters use `z.object`. An invalid request is answered `400 INVALID_ARGUMENT` with reason `INVALID_INPUT` and a field violation per problem before the handler runs.

```ts
import { parseApiInput } from '@nocobase/app-server/router';
import { validator } from 'hono/validator';

import { CancelOrderInput, OrderParams } from './schemas.js';

router.post(
  '/orders/:orderId/cancel',
  validator('param', (value) => parseApiInput(OrderParams, value)),
  validator('json', (value) => parseApiInput(CancelOrderInput, value)),
  async (context) => {
    const { orderId } = context.req.valid('param');
    const input = context.req.valid('json');
    return context.json({ data: await orders.cancel(orderId, input) });
  },
);
```

Keep schemas in `server/routes/schemas.ts`, or a `server/routes/schemas/` directory, and derive service types with `z.infer` rather than a second interface. `zod` is a `dependency` of the plugin. A binary or multipart body validates its headers, path parameters and query the same way and its body in code, answering `413` or `415` through `httpStatus` when it is too large or of the wrong type.

## Exceptions

- **Data endpoints from `defineRepositoryApiRoutes`** are `POST /api/{name}/{action}`, such as `POST /api/salesOrders/findMany`. The exposure name is a camelCase segment matching `/^[a-z][a-zA-Z0-9]*$/` and is checked when the routes are declared; name it after its Collection, never after a plugin namespace whose first segment it would share. Errors use the standard body with domain `app`.
- **Better Auth's routes under `/api/auth/`** stay as the library defines them.
- **`GET /api/healthz`** keeps the body probes read.
- **Streaming responses** (server-sent events, NDJSON) keep their frame format once the stream has started; their path, method, input validation and any failure before the first frame follow the rules above.

## Clients

`ApiClientError` from `@nocobase/app-client` exposes `status`, `reason`, `domain` and `requestId`. Branch on `reason`, never on `message` and never by reading `payload` yourself.

## Verify

- Every failure is the standard body; tests assert `error.reason`, not the message.
- An invalid body is `400` with the field in `fieldViolations`, and an unknown body field is rejected.
- A missing path resource is `404`, a missing referenced resource is `400`, and a forbidden one is `403` whether it exists or not.
- A `GET` changes nothing, and a list returns `{ data, meta }` with its paging parameters honored and capped.
