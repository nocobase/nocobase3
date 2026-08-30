/** Capabilities a generated plugin may provide to an App or another plugin. */
export const PLUGIN_CAPABILITIES = [
  'database',
  'server.providers',
  'server.routes',
  'server.jobs',
  'client.routes',
  'client.components',
  'client.providers',
  'client.bootstrap',
  'registry',
  'skills',
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export interface PluginCapabilities {
  readonly database: boolean;
  readonly server: {
    readonly providers: boolean;
    readonly routes: boolean;
    readonly jobs: boolean;
  };
  readonly client: {
    readonly routes: boolean;
    readonly components: boolean;
    readonly providers: boolean;
    readonly bootstrap: boolean;
  };
  readonly registry: boolean;
  readonly skills: boolean;
}

export function normalizePluginCapabilities(
  requested: readonly PluginCapability[],
): PluginCapabilities {
  const selected = new Set(requested);
  return {
    database: selected.has('database'),
    server: {
      providers: selected.has('server.providers'),
      routes: selected.has('server.routes'),
      jobs: selected.has('server.jobs'),
    },
    client: {
      routes: selected.has('client.routes'),
      components: selected.has('client.components'),
      providers: selected.has('client.providers'),
      bootstrap: selected.has('client.bootstrap'),
    },
    registry: selected.has('registry'),
    skills: selected.has('skills'),
  };
}

export function isPluginCapability(value: string): value is PluginCapability {
  return (PLUGIN_CAPABILITIES as readonly string[]).includes(value);
}
