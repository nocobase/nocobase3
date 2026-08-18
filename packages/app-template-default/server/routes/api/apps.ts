import type { Handler } from 'hono';

export function createAppsHandler(): Handler {
  return (c) =>
    c.json({
      apps: [],
    });
}
