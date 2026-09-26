import type { FetchLike } from './registry.ts';

export interface HealthOptions {
  timeoutMs: number;
  intervalMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** One request to the Hub's health route; true only for a response whose body says `ok: true`. */
export async function checkHealth(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}

/**
 * Polls the health route until it answers or the timeout passes. The server listens only once startup, migrations
 * included, has finished, so a healthy answer means the Hub is ready.
 */
export async function waitForHealthy(
  url: string,
  options: HealthOptions,
): Promise<boolean> {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + options.timeoutMs;
  for (;;) {
    if (await checkHealth(url, options.fetchImpl)) return true;
    if (now() >= deadline) return false;
    await sleep(options.intervalMs ?? 1_000);
  }
}
