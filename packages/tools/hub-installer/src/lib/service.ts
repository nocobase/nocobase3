import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkHealth, waitForHealthy } from './health.ts';
import type { Layout } from './layout.ts';
import type { Pm2 } from './pm2.ts';
import type { FetchLike } from './registry.ts';
import { tail } from './run-command.ts';

export interface ServiceOptions {
  layout: Layout;
  pm2: Pm2;
  name: string;
  healthUrl: string;
  fetchImpl?: FetchLike;
}

/**
 * Stops the Hub and waits until its health route stops answering. pm2 sends SIGINT and allows `kill_timeout` for the
 * Hub to stop its App Host first. A Hub pm2 does not know, such as one installed with `--no-start`, is simply not running.
 */
export async function stopHub(options: ServiceOptions): Promise<void> {
  const known = await options.pm2.describe(options.name);
  if (known) await options.pm2.stop(options.name);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!(await checkHealth(options.healthUrl, options.fetchImpl))) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `${options.healthUrl} still answers after stopping ${options.name}; another process may be serving the Hub's port.`,
  );
}

/**
 * Starts whatever `current` points at and waits for it to be healthy. The process entry is deleted first: pm2 keeps the
 * release path it resolved at `pm2 start`, so a restart after a switch would run the previous release.
 */
export async function startHub(
  options: ServiceOptions & { timeoutMs: number },
): Promise<boolean> {
  await options.pm2.remove(options.name);
  await options.pm2.start(options.layout.ecosystemFile, options.layout.root);
  const healthy = await waitForHealthy(options.healthUrl, {
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  if (healthy) {
    await options.pm2.save();
  } else {
    // A release that cannot start would otherwise be restarted by pm2 until it gives up.
    await options.pm2.remove(options.name).catch(() => undefined);
  }
  return healthy;
}

export async function errorLogTail(layout: Layout): Promise<string> {
  const text = await readFile(
    path.join(layout.logsDir, 'hub.err.log'),
    'utf8',
  ).catch(() => '');
  return tail(text, 30);
}
