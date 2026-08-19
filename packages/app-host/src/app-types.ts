/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AppState } from './events.ts';

export type AppDisposer = () => void | Promise<void>;

export type AppWebSocketReadyState = 0 | 1 | 2 | 3;

export type AppWebSocketMessageData = string | ArrayBuffer;

export interface AppWebSocketSendOptions {
  compress?: boolean;
}

export interface AppWebSocket {
  readonly url: URL;
  readonly protocol: string | null;
  readonly readyState: AppWebSocketReadyState;
  send(data: string | ArrayBuffer | Uint8Array, options?: AppWebSocketSendOptions): void;
  close(code?: number, reason?: string): void;
}

export interface AppWebSocketOpenEvent {
  readonly type: 'open';
}

export interface AppWebSocketMessageEvent {
  readonly type: 'message';
  readonly data: AppWebSocketMessageData;
}

export interface AppWebSocketCloseEvent {
  readonly type: 'close';
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

export interface AppWebSocketErrorEvent {
  readonly type: 'error';
  readonly error: unknown;
}

export interface AppWebSocketEvents {
  onOpen?: (event: AppWebSocketOpenEvent, ws: AppWebSocket) => void | Promise<void>;
  onMessage?: (event: AppWebSocketMessageEvent, ws: AppWebSocket) => void | Promise<void>;
  onClose?: (event: AppWebSocketCloseEvent, ws: AppWebSocket) => void | Promise<void>;
  onError?: (event: AppWebSocketErrorEvent, ws: AppWebSocket) => void | Promise<void>;
}

export type AppWebSocketAcceptResult = AppWebSocketEvents | Response | null | undefined;

export type AppWebSocketHandler = (
  request: Request,
  env?: unknown,
) => AppWebSocketAcceptResult | Promise<AppWebSocketAcceptResult>;

export interface FetchApp {
  fetch(request: Request, env?: unknown, executionCtx?: unknown): Response | Promise<Response>;
  websocket?: AppWebSocketHandler;
}

export interface AppScope {
  readonly id: string;
  readonly appName?: string;
  readonly version: number;
  readonly basePath: string;
  readonly assetsBasePath: string;
  readonly clientDir?: string;
  /**
   * Deprecated. App servers should define their own API routes under the
   * app-local path they receive, for example `/api/*`.
   */
  readonly apiBasePath: string;
  readonly rootDir?: string;
  readonly dataDir?: string;
  readonly config?: unknown;
  readonly signal: AbortSignal;
  registerDisposer(name: string, dispose: AppDisposer): void;
  onBeforeDestroy(handler: () => void | Promise<void>): () => void;
}

export type AppFactory = (scope: AppScope) => FetchApp | Promise<FetchApp>;

export type AppBackendKind = 'in-process' | 'worker' | 'process' | 'external-service';

export type AppIsolation = AppBackendKind;

export type AppTier = 'cold' | 'warm' | 'hot' | 'dedicated';

export interface AppCodeReference {
  version: string;
  rootDir: string;
  entrypoint: string;
  checksum?: string;
}

export interface AppClientReference {
  rootDir: string;
  index?: string;
  assetsDir?: string;
}

export interface AppServerReference {
  rootDir: string;
  entrypoint: string;
  healthPath?: string;
}

/**
 * Deprecated. Use AppServerReference.
 */
export type AppApiReference = AppServerReference;

export interface AppReleaseReference extends AppCodeReference {
  releaseDir: string;
  manifestPath?: string;
}

export interface AppResourcePolicy {
  memoryLimitMb?: number;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  drainTimeoutMs?: number;
  idleTtlMs?: number;
  maxConcurrentRequests?: number;
}

export interface AppRuntimeEndpoint {
  kind: 'in-process' | 'local-http' | 'external-http';
  host?: string;
  port?: number;
  url?: string;
  pid?: number;
  workerId?: string;
}

export interface AppDefinition<TConfig = unknown> {
  id: string;
  appName?: string;
  basePath: string;
  enabled: boolean;
  backend: AppBackendKind;
  configVersion: string;
  isolation: AppIsolation;
  tier: AppTier;
  desiredVersion: string;
  rootDir?: string;
  dataDir?: string;
  client?: AppClientReference;
  server?: AppServerReference;
  /**
   * Deprecated. Use `server`.
   */
  api?: AppApiReference;
  code?: AppCodeReference;
  release?: AppReleaseReference;
  healthPath?: string;
  resourcePolicy?: AppResourcePolicy;
  config?: TConfig;
}

export interface CreateAppDefinitionOptions<TConfig = unknown> {
  appName?: string;
  basePath?: string;
  enabled?: boolean;
  backend?: AppBackendKind;
  configVersion?: string;
  isolation?: AppIsolation;
  tier?: AppTier;
  desiredVersion?: string;
  rootDir?: string;
  dataDir?: string;
  /**
   * Deprecated shortcut for a server artifact entrypoint. Prefer `server.entrypoint`.
   */
  entrypoint?: string;
  client?: AppClientReference;
  server?: AppServerReference;
  /**
   * Deprecated. Use `server`.
   */
  api?: AppApiReference;
  code?: AppCodeReference;
  release?: AppReleaseReference;
  healthPath?: string;
  resourcePolicy?: AppResourcePolicy;
  config?: TConfig;
}

export interface AppDestroyOptions {
  reason?: string;
  timeoutMs?: number;
}

export interface AppSnapshot {
  id: string;
  appName?: string;
  version: number;
  basePath: string;
  backend: AppBackendKind;
  configVersion: string;
  desiredVersion: string;
  codeVersion: string;
  isolation: AppIsolation;
  tier: AppTier;
  state: AppState;
  endpoint: AppRuntimeEndpoint;
  activeRequests: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  lastError: string | null;
  disposerCount: number;
}

export interface ActiveAppHandle {
  readonly id: string;
  readonly version: number;
  readonly basePath: string;
  readonly backend: AppBackendKind;
  readonly signal: AbortSignal;
  readonly state: AppState;
  dispatch(request: Request, metadata?: AppRequestMetadata): Promise<Response>;
  acceptWebSocket(request: Request, metadata?: AppRequestMetadata): Promise<AppWebSocketAcceptResult>;
  destroy(options?: string | AppDestroyOptions): Promise<void>;
  snapshot(): AppSnapshot;
}

export interface AppRequestMetadata {
  method?: string;
  path?: string;
}

export interface AppActivationRequest {
  definition: AppDefinition;
  version: number;
  createApp: AppFactory;
}

export interface AppActivationBackend {
  readonly kind: AppBackendKind;
  activate(request: AppActivationRequest): Promise<ActiveAppHandle>;
}

export interface DeployAppOptions {
  version?: string;
  reason?: string;
  strategy?: 'restart' | 'blue-green';
  destroyTimeoutMs?: number;
  waitForReady?: boolean;
}

export interface AppDeploymentResult {
  id: string;
  strategy: 'restart' | 'blue-green';
  previousVersion: string | null;
  desiredVersion: string;
  activeVersion: string;
  changed: boolean;
  app: AppSnapshot;
}
