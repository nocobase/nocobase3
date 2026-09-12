# @nocobase/app-plugin-queue-example

Queue app plugin example. When enabled, the app discovers jobs from the
convention-based `server/jobs` directory and loads the
`server/routes/index.ts` entry.

Send an authenticated `GET` request to `/api/queue-example` to dispatch the
example job. The Route owns a path-scoped authentication boundary, so it does
not depend on contribution order and does not affect Routes mounted later.
