/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ChildProcess } from 'node:child_process';
import type { HostManagementService } from './manager.ts';
import type {
  ApplyDeploymentSetResult,
  HostDeploymentSet,
  HostStatus,
} from './types.ts';

const IPC_CHANNEL = 'nocobase-app-host';

type IpcMethod = 'applyDeploymentSet' | 'getStatus' | 'restartApp';

interface IpcRequest {
  channel: typeof IPC_CHANNEL;
  kind: 'request';
  requestId: string;
  session: string;
  method: IpcMethod;
  payload?: unknown;
}

interface IpcResponse {
  channel: typeof IPC_CHANNEL;
  kind: 'response';
  requestId: string;
  result?: unknown;
  error?: string;
}

export interface IpcHostManagementClientOptions {
  session: string;
  timeoutMs?: number;
}

export class IpcHostManagementClient implements HostManagementService {
  private sequence = 0;
  private readonly session: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly child: ChildProcess,
    options: IpcHostManagementClientOptions,
  ) {
    this.session = options.session;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<ApplyDeploymentSetResult> {
    return this.call<ApplyDeploymentSetResult>(
      'applyDeploymentSet',
      deploymentSet,
    );
  }

  getStatus(): Promise<HostStatus> {
    return this.call<HostStatus>('getStatus');
  }

  restartApp(appId: string): Promise<HostStatus> {
    return this.call<HostStatus>('restartApp', { appId });
  }

  private call<T>(method: IpcMethod, payload?: unknown): Promise<T> {
    if (!this.child.connected) {
      return Promise.reject(new Error('App host IPC channel is disconnected'));
    }
    const requestId = `${process.pid}-${Date.now()}-${++this.sequence}`;
    const request: IpcRequest = {
      channel: IPC_CHANNEL,
      kind: 'request',
      requestId,
      session: this.session,
      method,
      payload,
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`App host IPC request "${method}" timed out`));
      }, this.timeoutMs);
      timeout.unref?.();

      const onMessage = (message: unknown): void => {
        if (!isIpcResponse(message) || message.requestId !== requestId) {
          return;
        }
        cleanup();
        if (message.error) {
          reject(new Error(message.error));
          return;
        }
        resolve(message.result as T);
      };
      const onExit = (): void => {
        cleanup();
        reject(new Error(`App host exited during IPC request "${method}"`));
      };
      const cleanup = (): void => {
        clearTimeout(timeout);
        this.child.off('message', onMessage);
        this.child.off('exit', onExit);
      };
      this.child.on('message', onMessage);
      this.child.once('exit', onExit);
      this.child.send(request, (error) => {
        if (error) {
          cleanup();
          reject(error);
        }
      });
    });
  }
}

export class IpcHostManagementServer {
  private attached = false;

  constructor(
    private readonly service: HostManagementService,
    private readonly session: string,
  ) {}

  attach(): void {
    if (this.attached) {
      return;
    }
    if (typeof process.send !== 'function') {
      throw new Error('Managed app host requires a Node IPC channel');
    }
    this.attached = true;
    process.on('message', this.handleMessage);
  }

  close(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    process.off('message', this.handleMessage);
  }

  private readonly handleMessage = (message: unknown): void => {
    if (!isIpcRequest(message)) {
      return;
    }
    this.respond(message).catch((error: unknown) => {
      this.send({
        channel: IPC_CHANNEL,
        kind: 'response',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  private async respond(request: IpcRequest): Promise<void> {
    if (request.session !== this.session) {
      throw new Error('Invalid app host IPC session');
    }
    let result: unknown;
    switch (request.method) {
      case 'getStatus':
        result = await this.service.getStatus();
        break;
      case 'applyDeploymentSet':
        result = await this.service.applyDeploymentSet(
          request.payload as HostDeploymentSet,
        );
        break;
      case 'restartApp':
        result = await this.service.restartApp(
          (request.payload as { appId: string }).appId,
        );
        break;
    }
    this.send({
      channel: IPC_CHANNEL,
      kind: 'response',
      requestId: request.requestId,
      result,
    });
  }

  private send(response: IpcResponse): void {
    process.send?.(response);
  }
}

function isIpcRequest(value: unknown): value is IpcRequest {
  const candidate = value as Partial<IpcRequest> | null;
  return (
    typeof candidate === 'object' &&
    candidate?.channel === IPC_CHANNEL &&
    candidate.kind === 'request' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.session === 'string' &&
    isIpcMethod(candidate.method)
  );
}

function isIpcMethod(value: unknown): value is IpcMethod {
  return (
    value === 'applyDeploymentSet' ||
    value === 'getStatus' ||
    value === 'restartApp'
  );
}

function isIpcResponse(value: unknown): value is IpcResponse {
  const candidate = value as Partial<IpcResponse> | null;
  return (
    typeof candidate === 'object' &&
    candidate?.channel === IPC_CHANNEL &&
    candidate.kind === 'response' &&
    typeof candidate.requestId === 'string'
  );
}
