import {
  decryptSessionCookie,
  encryptSessionCookie,
  generateSessionId,
} from './crypto.js';
import { parseSessionDuration } from './duration.js';
import { createSessionStore } from './stores.js';
import type {
  AppSessionConfig,
  CreateRequestSessionOptions,
  NocoBaseSession,
  NocoBaseSessionManager,
  NocoBaseSessionStore,
  PersistSessionResult,
  PersistableSession,
  ResolvedSessionConfig,
  SessionData,
  SessionUpdate,
  StoredSession,
} from './types.js';

export function createSessionManager<Data extends SessionData = SessionData>(
  config: AppSessionConfig,
): NocoBaseSessionManager<Data> {
  const resolved = resolveSessionConfig(config);
  assertDefaultSessionStore(config);
  assertSessionSecret(resolved);

  return new DefaultSessionManager<Data>(
    resolved,
    createSessionStore<Data>(config.stores[resolved.store]),
  );
}

export function createNullSessionConfig(): AppSessionConfig {
  return {
    enabled: false,
    default: 'null',
    stores: {
      null: {
        driver: 'null',
      },
    },
    cookie: {
      name: 'nocobase_session',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
    lifetime: {
      absolute: '2h',
      rolling: false,
    },
    secret: 'disabled-session-secret',
  };
}

export function assertDefaultSessionStore(config: AppSessionConfig): void {
  if (!config.stores[config.default]) {
    throw new Error(`Default session store "${config.default}" is not configured.`);
  }
}

export function resolveSessionConfig(config: AppSessionConfig): ResolvedSessionConfig {
  return {
    enabled: config.enabled ?? true,
    store: config.default,
    cookie: {
      name: config.cookie.name,
      path: config.cookie.path ?? '/',
      domain: config.cookie.domain,
      secure: config.cookie.partitioned ? true : config.cookie.secure,
      httpOnly: config.cookie.httpOnly ?? true,
      sameSite: config.cookie.sameSite ?? 'lax',
      partitioned: config.cookie.partitioned,
      expireOnClose: config.cookie.expireOnClose ?? false,
    },
    lifetime: {
      absoluteMs: parseSessionDuration(config.lifetime.absolute, 'Absolute'),
      inactivityMs: config.lifetime.inactivity
        ? parseSessionDuration(config.lifetime.inactivity, 'Inactivity')
        : undefined,
      rolling: config.lifetime.rolling ?? true,
    },
    secret: config.secret,
    previousSecrets: config.previousSecrets ?? [],
    gcLottery: config.gcLottery ?? [2, 100],
  };
}

class DefaultSessionManager<Data extends SessionData> implements NocoBaseSessionManager<Data> {
  constructor(
    public readonly config: ResolvedSessionConfig,
    public readonly store: NocoBaseSessionStore<Data>,
  ) {}

  createRequestSession(options: CreateRequestSessionOptions): NocoBaseSession<Data> & PersistableSession {
    return new RequestSession<Data>(this.config, this.store, options);
  }

  async sweepExpiredSessions(now: number = Date.now()): Promise<number> {
    if (!this.store.keys) {
      return 0;
    }

    let deleted = 0;
    for (const id of await this.store.keys()) {
      const stored = await this.store.get(id);
      if (stored && isStoredSessionExpired(stored, now)) {
        await this.store.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }

  async dispose(): Promise<void> {
    await this.store.dispose?.();
  }
}

class RequestSession<Data extends SessionData> implements NocoBaseSession<Data>, PersistableSession {
  private idValue: string | null = null;
  private dataValue: Data | null = null;
  private loaded = false;
  private dirty = false;
  private destroyed = false;
  private deleteCookie = false;
  private storedValue: StoredSession<Data> | undefined;
  private readonly now: number;

  constructor(
    private readonly config: ResolvedSessionConfig,
    private readonly store: NocoBaseSessionStore<Data>,
    private readonly options: CreateRequestSessionOptions,
  ) {
    this.now = options.now ?? Date.now();
  }

  get id(): string | null {
    return this.idValue;
  }

  async get(): Promise<Data | null> {
    await this.load();
    return this.dataValue;
  }

  async update(data: Data | SessionUpdate<Data>): Promise<void> {
    await this.load();
    const nextData = typeof data === 'function' ? data(this.dataValue) : data;
    this.ensureSessionId();
    this.dataValue = nextData;
    this.dirty = true;
    this.destroyed = false;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.update((previous) => ({
      ...(previous ?? {}),
      [key]: value,
    }) as Data);
  }

  async forget(key: string): Promise<void> {
    await this.update((previous) => {
      const next = { ...(previous ?? {}) };
      delete next[key];
      return next as Data;
    });
  }

  async regenerate(): Promise<void> {
    await this.load();
    if (this.idValue) {
      await this.store.delete(this.idValue);
    }
    this.idValue = generateSessionId();
    this.storedValue = undefined;
    this.dirty = true;
    this.destroyed = false;
  }

  async destroy(): Promise<void> {
    await this.load();
    if (this.idValue) {
      await this.store.delete(this.idValue);
    }
    this.idValue = null;
    this.dataValue = null;
    this.storedValue = undefined;
    this.destroyed = true;
    this.dirty = false;
    this.deleteCookie = true;
  }

  async persist(): Promise<PersistSessionResult> {
    if (!this.loaded && !this.destroyed && !this.dirty) {
      return { action: 'none' };
    }

    if (this.destroyed || this.deleteCookie || !this.idValue || !this.dataValue) {
      return { action: this.deleteCookie ? 'delete-cookie' : 'none' };
    }

    const now = Date.now();
    const stored = createStoredSession(this.dataValue, this.config, now, this.storedValue);
    const ttl = Math.max(1, Math.ceil((stored.expiresAt - now) / 1000));
    await this.store.set(this.idValue, stored, { ttl });
    this.storedValue = stored;

    return {
      action: 'set-cookie',
      cookieValue: await encryptSessionCookie({ sid: this.idValue }, this.config.secret, stored.expiresAt),
      maxAge: this.resolveCookieMaxAge(stored, now),
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    this.loaded = true;
    const cookieValue = this.options.cookieValue;
    if (!cookieValue) {
      return;
    }

    const payload = await decryptSessionCookie(cookieValue, [this.config.secret, ...this.config.previousSecrets]);
    if (!payload) {
      this.deleteCookie = true;
      return;
    }

    const stored = await this.store.get(payload.sid);
    if (!stored || isStoredSessionExpired(stored, this.now)) {
      await this.store.delete(payload.sid);
      this.deleteCookie = true;
      return;
    }

    this.idValue = payload.sid;
    this.dataValue = stored.data;
    this.storedValue = stored;

    if (shouldRefreshSession(stored, this.config, this.now)) {
      this.dirty = true;
    }
  }

  private ensureSessionId(): void {
    this.idValue ??= generateSessionId();
  }

  private resolveCookieMaxAge(stored: StoredSession<Data>, now: number): number | undefined {
    if (this.config.cookie.expireOnClose) {
      return undefined;
    }

    const sessionMaxAge = Math.max(1, Math.ceil((stored.expiresAt - now) / 1000));
    if (!stored.idleExpiresAt) {
      return sessionMaxAge;
    }

    const idleMaxAge = Math.max(1, Math.ceil((stored.idleExpiresAt - now) / 1000));
    return Math.min(sessionMaxAge, idleMaxAge);
  }
}

function assertSessionSecret(config: ResolvedSessionConfig): void {
  if (config.enabled && !config.secret.trim()) {
    throw new Error('Session secret is not configured.');
  }
}

function createStoredSession<Data extends SessionData>(
  data: Data,
  config: ResolvedSessionConfig,
  now: number,
  previous?: StoredSession<Data>,
): StoredSession<Data> {
  const expiresAt = previous?.expiresAt ?? now + config.lifetime.absoluteMs;
  const idleExpiresAt = config.lifetime.inactivityMs
    ? now + config.lifetime.inactivityMs
    : undefined;

  return {
    data,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    expiresAt,
    idleExpiresAt,
  };
}

function isStoredSessionExpired(stored: StoredSession, now: number): boolean {
  return stored.expiresAt <= now || Boolean(stored.idleExpiresAt && stored.idleExpiresAt <= now);
}

function shouldRefreshSession(stored: StoredSession, config: ResolvedSessionConfig, now: number): boolean {
  if (!config.lifetime.rolling || !config.lifetime.inactivityMs) {
    return false;
  }

  return Boolean(stored.idleExpiresAt && stored.idleExpiresAt - now < config.lifetime.inactivityMs / 2);
}
