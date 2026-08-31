import { useCallback, useEffect, useRef, useState } from 'react';
import { nocobaseClient } from '@nocobase/app-portal-sdk/client';

export type NocoBasePluginLane = 'client' | 'client-v2';

export type EnabledNocoBasePlugin = {
  name?: string;
  packageName?: string;
};

type NocoBasePluginProbeQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export type NocoBasePluginProbe = {
  resource: string;
  action: string;
  query?: Record<string, NocoBasePluginProbeQueryValue>;
};

export type NocoBasePluginRequirement = {
  packageName: string;
  name?: string;
  label: string;
  /** Optional read-only fallback when a source/dev plugin is absent from the client manifest. */
  probe?: NocoBasePluginProbe;
};

export type NocoBasePluginRequirementMode = 'all' | 'any';
type CachedEnabledPlugins = {
  expiresAt: number;
  plugins?: EnabledNocoBasePlugin[];
  request?: Promise<EnabledNocoBasePlugin[]>;
};

type CachedPluginProbe = {
  expiresAt: number;
  available?: boolean;
  request?: Promise<boolean>;
};

type PluginPrerequisiteState =
  | { status: 'checking'; missingPlugins: [] }
  | { status: 'available'; missingPlugins: [] }
  | {
      status: 'unavailable';
      missingPlugins: NocoBasePluginRequirement[];
    }
  | { status: 'error'; missingPlugins: []; error: unknown };

const ENABLED_PLUGIN_CACHE_TTL = 60_000;
const enabledPluginCache = new Map<string, CachedEnabledPlugins>();
const pluginProbeCache = new Map<string, CachedPluginProbe>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function enabledPluginRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (isRecord(payload.data)) {
    if (Array.isArray(payload.data.data)) return payload.data.data;
    if (Array.isArray(payload.data.rows)) return payload.data.rows;
  }
  return [];
}

function pluginRequirementsKey(requirements: NocoBasePluginRequirement[]) {
  return JSON.stringify(
    requirements.map(({ packageName, name, probe }) => ({
      packageName,
      name,
      probe,
    })),
  );
}

export function normalizeEnabledNocoBasePlugins(
  payload: unknown,
): EnabledNocoBasePlugin[] {
  return enabledPluginRows(payload).flatMap((value) => {
    if (!isRecord(value)) return [];
    const name = typeof value.name === 'string' ? value.name : undefined;
    const packageName =
      typeof value.packageName === 'string' ? value.packageName : undefined;
    return name || packageName ? [{ name, packageName }] : [];
  });
}

function matchesRequirement(
  plugin: EnabledNocoBasePlugin,
  requirement: NocoBasePluginRequirement,
) {
  return (
    plugin.packageName === requirement.packageName ||
    (!!requirement.name && plugin.name === requirement.name)
  );
}

export function evaluateNocoBasePluginRequirements(
  enabledPlugins: EnabledNocoBasePlugin[],
  requirements: NocoBasePluginRequirement[],
  mode: NocoBasePluginRequirementMode = 'all',
) {
  if (!requirements.length) {
    return { available: true, missingPlugins: [] };
  }

  const missingPlugins = requirements.filter(
    (requirement) =>
      !enabledPlugins.some((plugin) => matchesRequirement(plugin, requirement)),
  );
  const available =
    mode === 'all'
      ? missingPlugins.length === 0
      : missingPlugins.length < requirements.length;

  return {
    available,
    missingPlugins: available ? [] : missingPlugins,
  };
}

function enabledPluginCacheKey(lane: NocoBasePluginLane) {
  return [nocobaseClient.getApiUrl(), nocobaseClient.getAppName(), lane].join(
    '\u0000',
  );
}

async function loadEnabledNocoBasePlugins(
  lane: NocoBasePluginLane,
  force: boolean,
) {
  const key = enabledPluginCacheKey(lane);
  const cached = enabledPluginCache.get(key);
  const now = Date.now();

  if (!force && cached?.plugins && cached.expiresAt > now) {
    return cached.plugins;
  }
  if (cached?.request) {
    return cached.request;
  }

  const action = lane === 'client-v2' ? 'listEnabledV2' : 'listEnabled';
  const request = nocobaseClient
    .action<unknown>('pm', action, { method: 'GET' })
    .then(normalizeEnabledNocoBasePlugins)
    .then((plugins) => {
      enabledPluginCache.set(key, {
        plugins,
        expiresAt: Date.now() + ENABLED_PLUGIN_CACHE_TTL,
      });
      return plugins;
    })
    .catch((error: unknown) => {
      if (enabledPluginCache.get(key)?.request === request) {
        enabledPluginCache.delete(key);
      }
      throw error;
    });

  enabledPluginCache.set(key, {
    plugins: cached?.plugins,
    expiresAt: cached?.expiresAt ?? 0,
    request,
  });
  return request;
}

function pluginProbeCacheKey(probe: NocoBasePluginProbe) {
  return [
    nocobaseClient.getApiUrl(),
    nocobaseClient.getAppName(),
    probe.resource,
    probe.action,
    JSON.stringify(probe.query ?? {}),
  ].join('\u0000');
}

function isMissingPluginProbeError(error: unknown) {
  return isRecord(error) && error.status === 404;
}

async function loadPluginProbe(probe: NocoBasePluginProbe, force: boolean) {
  const key = pluginProbeCacheKey(probe);
  const cached = pluginProbeCache.get(key);
  const now = Date.now();

  if (!force && cached?.available !== undefined && cached.expiresAt > now) {
    return cached.available;
  }
  if (cached?.request) {
    return cached.request;
  }

  const request = (async () => {
    try {
      await nocobaseClient.action<unknown>(probe.resource, probe.action, {
        method: 'GET',
        query: probe.query,
      });
      return true;
    } catch (error) {
      if (isMissingPluginProbeError(error)) return false;
      throw error;
    }
  })()
    .then((available) => {
      pluginProbeCache.set(key, {
        available,
        expiresAt: Date.now() + ENABLED_PLUGIN_CACHE_TTL,
      });
      return available;
    })
    .catch((error: unknown) => {
      if (pluginProbeCache.get(key)?.request === request) {
        pluginProbeCache.delete(key);
      }
      throw error;
    });

  pluginProbeCache.set(key, {
    available: cached?.available,
    expiresAt: cached?.expiresAt ?? 0,
    request,
  });
  return request;
}

async function supplementEnabledPluginsWithProbes(
  enabledPlugins: EnabledNocoBasePlugin[],
  missingPlugins: NocoBasePluginRequirement[],
  force: boolean,
) {
  const probeResults = await Promise.all(
    missingPlugins.map(async (requirement) => ({
      requirement,
      available: requirement.probe
        ? await loadPluginProbe(requirement.probe, force)
        : false,
    })),
  );

  return [
    ...enabledPlugins,
    ...probeResults.flatMap(({ requirement, available }) =>
      available
        ? [
            {
              name: requirement.name,
              packageName: requirement.packageName,
            },
          ]
        : [],
    ),
  ];
}

export function clearNocoBasePluginPrerequisiteCache() {
  enabledPluginCache.clear();
  pluginProbeCache.clear();
}

export function useNocoBasePluginPrerequisite({
  requirements,
  mode = 'all',
  lane = 'client-v2',
}: {
  requirements: NocoBasePluginRequirement[];
  mode?: NocoBasePluginRequirementMode;
  lane?: NocoBasePluginLane;
}) {
  const requirementsRef = useRef(requirements);
  requirementsRef.current = requirements;
  const requestSequence = useRef(0);
  const requirementsKey = pluginRequirementsKey(requirements);
  const [state, setState] = useState<PluginPrerequisiteState>({
    status: 'checking',
    missingPlugins: [],
  });

  const check = useCallback(
    async (force = false) => {
      const sequence = ++requestSequence.current;
      setState({ status: 'checking', missingPlugins: [] });
      try {
        const enabledPlugins = await loadEnabledNocoBasePlugins(lane, force);
        if (sequence !== requestSequence.current) return;
        const currentRequirements = requirementsRef.current;
        if (pluginRequirementsKey(currentRequirements) !== requirementsKey)
          return;
        let result = evaluateNocoBasePluginRequirements(
          enabledPlugins,
          currentRequirements,
          mode,
        );
        if (
          !result.available &&
          result.missingPlugins.some((requirement) => requirement.probe)
        ) {
          const supplementedPlugins = await supplementEnabledPluginsWithProbes(
            enabledPlugins,
            result.missingPlugins,
            force,
          );
          if (sequence !== requestSequence.current) return;
          if (
            pluginRequirementsKey(requirementsRef.current) !== requirementsKey
          )
            return;
          result = evaluateNocoBasePluginRequirements(
            supplementedPlugins,
            currentRequirements,
            mode,
          );
        }
        setState(
          result.available
            ? { status: 'available', missingPlugins: [] }
            : {
                status: 'unavailable',
                missingPlugins: result.missingPlugins,
              },
        );
      } catch (error) {
        if (sequence !== requestSequence.current) return;
        setState({ status: 'error', missingPlugins: [], error });
      }
    },
    [lane, mode, requirementsKey],
  );

  useEffect(() => {
    check();
    return () => {
      requestSequence.current += 1;
    };
  }, [check]);

  return {
    ...state,
    retry: () => check(true),
  };
}
