import type { Context } from 'hono';

/**
 * The parts of a NocoBase session this package uses, declared structurally so it does not depend on
 * `@nocobase/session` — an application that mounts no session middleware still gets working locale resolution.
 *
 * Reading is asynchronous because the session may still need to be loaded from its store.
 */
export interface I18nSession {
  get(): Promise<Record<string, unknown> | null>;
  set(key: string, value: unknown): Promise<void>;
}

export function isI18nSession(value: unknown): value is I18nSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<I18nSession>;
  return (
    typeof candidate.get === 'function' && typeof candidate.set === 'function'
  );
}

/**
 * Reads the session off a Hono context.
 *
 * Hono types `c.get` against the router's declared variables, and a router that declares none types every key as
 * `never`. Route contributions here are plain `Hono` instances, so the lookup goes through this one accessor instead
 * of each caller widening the context itself.
 */
export function getContextSession(context: Context): I18nSession | undefined {
  const session: unknown = (
    context as unknown as { get: (key: string) => unknown }
  ).get('session');
  return isI18nSession(session) ? session : undefined;
}
