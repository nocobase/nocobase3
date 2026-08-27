import path from 'node:path';

import {
  AppHostSupervisor,
  type AppHostDriver,
  type AppHostLease,
  type AppHostSupervisorOptions,
} from '@nocobase/app-host/supervisor';
import {
  type EnvMap,
  getEnvBoolean,
  getEnvString,
} from '@nocobase/app-server-kit/config';

export interface HubAppHostSupervisor {
  acquire(): Promise<AppHostLease>;
  shutdown(): Promise<void>;
}

export interface HubAppHostRuntime {
  readonly targetUrl: URL;
  close(): Promise<void>;
}

export interface StartHubAppHostRuntimeOptions {
  env: EnvMap;
  packageRoot: string;
  supervisor?: HubAppHostSupervisor;
}

/**
 * Starts the default App Host child process, or acquires the configured
 * external App Host in cluster mode. The returned lease is held for the whole
 * Hub server lifetime so the runtime topology has one explicit owner.
 */
export async function startHubAppHostRuntime(
  options: StartHubAppHostRuntimeOptions,
): Promise<HubAppHostRuntime> {
  const supervisor =
    options.supervisor ??
    AppHostSupervisor.getInstance(
      resolveHubAppHostSupervisorOptions(options.env, options.packageRoot),
    );
  const lease = await supervisor.acquire();
  let closed = false;

  return {
    targetUrl: lease.targetUrl,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      lease.release();
      await supervisor.shutdown();
    },
  };
}

export function resolveHubAppHostSupervisorOptions(
  env: EnvMap,
  packageRoot: string,
): AppHostSupervisorOptions {
  const configuredDistDir = getEnvString(env, 'APP_DIST_DIR');
  return {
    enabled: getEnvBoolean(env, 'APP_HOST_ENABLED'),
    targetUrl:
      getEnvString(env, 'APP_HOST_URL') ??
      // Backward compatibility for the preview configuration. New
      // deployments should use APP_HOST_URL for an external App Host.
      getEnvString(env, 'APP_HOST_CONTROL_URL'),
    appDistDir: configuredDistDir
      ? path.resolve(packageRoot, configuredDistDir)
      : path.join(packageRoot, 'app-dist'),
    host: getEnvString(env, 'APP_HOST_BIND'),
    port: positiveIntegerFromEnv(env, 'APP_HOST_PORT'),
    driver: appHostDriverFromEnv(env),
    startTimeoutMs: positiveIntegerFromEnv(env, 'APP_HOST_START_TIMEOUT_MS'),
    shutdownTimeoutMs: positiveIntegerFromEnv(
      env,
      'APP_HOST_SHUTDOWN_TIMEOUT_MS',
    ),
    healthPath: getEnvString(env, 'APP_HOST_HEALTH_PATH'),
    controlToken: getEnvString(env, 'APP_HOST_CONTROL_TOKEN'),
  };
}

function appHostDriverFromEnv(env: EnvMap): AppHostDriver | undefined {
  const value = getEnvString(env, 'APP_HOST_DRIVER');
  if (!value) return undefined;
  if (value === 'node' || value === 'tsx') return value;
  throw new Error('APP_HOST_DRIVER must be either node or tsx.');
}

function positiveIntegerFromEnv(env: EnvMap, name: string): number | undefined {
  const value = getEnvString(env, name);
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
