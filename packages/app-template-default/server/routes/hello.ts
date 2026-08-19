import type { Handler } from 'hono';

export function createHelloPageHandler(): Handler {
  return (c) =>
    c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Hello from NocoBase</title>
  </head>
  <body>
    <main>
      <h1>Hello from NocoBase</h1>
      <p>This page is rendered by an app-local server route.</p>
    </main>
  </body>
</html>`);
}
