export type SessionData = Record<string, unknown>;

export type SessionSameSite = 'lax' | 'strict' | 'none';

export type SessionDuration = number | string;

export interface AppSessionCookieConfig {
  name: string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: SessionSameSite;
  partitioned?: boolean;
  expireOnClose?: boolean;
}

export interface AppSessionLifetimeConfig {
  absolute: SessionDuration;
  inactivity?: SessionDuration;
  rolling?: boolean;
}

export interface MemorySessionStoreConfig {
  driver: 'memory';
  base?: string;
}

export interface FsSessionStoreConfig {
  driver: 'fs';
  base: string;
}

export interface RedisSessionStoreConfig {
  driver: 'redis';
  base?: string;
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
  tls?: boolean;
}

export interface NullSessionStoreConfig {
  driver: 'null';
}

export type AppSessionStoreConfig =
  | MemorySessionStoreConfig
  | FsSessionStoreConfig
  | RedisSessionStoreConfig
  | NullSessionStoreConfig;

export interface AppSessionConfig {
  enabled?: boolean;
  default: string;
  stores: Record<string, AppSessionStoreConfig>;
  cookie: AppSessionCookieConfig;
  lifetime: AppSessionLifetimeConfig;
  secret: string;
  previousSecrets?: string[];
  gcLottery?: [number, number];
}

export interface StoredSession<Data extends SessionData = SessionData> {
  data: Data;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  idleExpiresAt?: number;
}

export interface NocoBaseSessionStore<Data extends SessionData = SessionData> {
  get(id: string): Promise<StoredSession<Data> | null>;
  set(
    id: string,
    value: StoredSession<Data>,
    options?: SessionStoreSetOptions,
  ): Promise<void>;
  delete(id: string): Promise<void>;
  keys?(): Promise<string[]>;
  dispose?(): Promise<void>;
}

export interface SessionStoreSetOptions {
  ttl?: number;
}

export interface NocoBaseSession<Data extends SessionData = SessionData> {
  readonly id: string | null;
  get(): Promise<Data | null>;
  update(data: Data | SessionUpdate<Data>): Promise<void>;
  set(key: string, value: unknown): Promise<void>;
  forget(key: string): Promise<void>;
  regenerate(): Promise<void>;
  destroy(): Promise<void>;
}

export type SessionUpdate<Data extends SessionData> = (
  previous: Data | null,
) => Data;

export interface NocoBaseSessionManager<
  Data extends SessionData = SessionData,
> {
  readonly config: ResolvedSessionConfig;
  readonly store: NocoBaseSessionStore<Data>;
  createRequestSession(
    options: CreateRequestSessionOptions,
  ): NocoBaseSession<Data> & PersistableSession;
  sweepExpiredSessions(now?: number): Promise<number>;
  dispose(): Promise<void>;
}

export interface ResolvedSessionConfig {
  enabled: boolean;
  store: string;
  cookie: Required<
    Pick<
      AppSessionCookieConfig,
      'name' | 'path' | 'httpOnly' | 'sameSite' | 'expireOnClose'
    >
  > &
    Pick<AppSessionCookieConfig, 'domain' | 'secure' | 'partitioned'>;
  lifetime: {
    absoluteMs: number;
    inactivityMs?: number;
    rolling: boolean;
  };
  secret: string;
  previousSecrets: string[];
  gcLottery: [number, number];
}

export interface CreateRequestSessionOptions {
  cookieValue?: string;
  now?: number;
}

export interface PersistSessionResult {
  action: 'none' | 'set-cookie' | 'delete-cookie';
  cookieValue?: string;
  maxAge?: number;
}

export interface PersistableSession {
  persist(): Promise<PersistSessionResult>;
}
