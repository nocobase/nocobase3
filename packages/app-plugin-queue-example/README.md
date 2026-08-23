# @nocobase/app-plugin-queue-example

Queue app plugin example. When enabled, the app discovers jobs from the
convention-based `server/jobs` directory and loads the
`server/routes/index.ts` entry.

Send a `GET` request to `/queue-example` to dispatch the example job.
