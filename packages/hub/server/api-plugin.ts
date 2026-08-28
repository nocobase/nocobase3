import type { Hono } from 'hono';

export interface HubApiPlugin {
  readonly id: string;
  registerApiRoutes(api: Hono): void;
}

/** Mounts Hub-owned API capabilities without coupling the Hub shell to their services or stores. */
export function registerHubApiPlugins(
  api: Hono,
  plugins: readonly HubApiPlugin[],
): void {
  const registered = new Set<string>();
  const normalized = plugins.map((plugin) => ({
    id: plugin.id.trim(),
    plugin,
  }));

  for (const { id } of normalized) {
    if (!id) {
      throw new Error('Hub API plugin id cannot be empty.');
    }
    if (registered.has(id)) {
      throw new Error(`Hub API plugin "${id}" is registered more than once.`);
    }

    registered.add(id);
  }

  for (const { plugin } of normalized) {
    plugin.registerApiRoutes(api);
  }
}
