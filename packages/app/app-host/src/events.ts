/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { EventEmitter } from 'node:events';

export type AppState =
  'creating' | 'active' | 'draining' | 'destroying' | 'destroyed' | 'failed';

export type AppEvent =
  | 'app:beforeCreate'
  | 'app:created'
  | 'app:createFailed'
  | 'app:requestStart'
  | 'app:requestEnd'
  | 'app:requestError'
  | 'app:beforeDrain'
  | 'app:draining'
  | 'app:beforeDestroy'
  | 'app:destroying'
  | 'app:resourceDispose'
  | 'app:resourceDisposed'
  | 'app:destroyed'
  | 'app:destroyFailed';

export interface AppEventPayload {
  appId: string;
  version: number;
  basePath: string;
  state: AppState;
  reason?: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  resourceName?: string;
  error?: unknown;
  activeRequests?: number;
  metadata?: Record<string, unknown>;
}

export type AppEventHandler = (
  payload: AppEventPayload,
) => void | Promise<void>;

export class AppEventBus {
  private readonly emitter = new EventEmitter();

  on(event: AppEvent, handler: AppEventHandler): () => void {
    const listener = this.createListener(handler);
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  once(event: AppEvent, handler: AppEventHandler): () => void {
    const listener = this.createListener(handler);
    this.emitter.once(event, listener);
    return () => this.emitter.off(event, listener);
  }

  emit(event: AppEvent, payload: AppEventPayload): void {
    this.emitter.emit(event, payload);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  private createListener(
    handler: AppEventHandler,
  ): (payload: AppEventPayload) => void {
    return (payload: AppEventPayload): void => {
      const handlerResult = handler(payload);
      if (handlerResult) {
        handlerResult.catch((error: unknown) => {
          queueMicrotask(() => {
            throw error;
          });
        });
      }
    };
  }
}
