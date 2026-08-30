import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type HeartbeatStatus = 'stopped' | 'running' | 'ready';

export interface HeartbeatState {
  readonly status: HeartbeatStatus;
  readonly startedAt: string | undefined;
}

export interface HeartbeatService {
  start(): void;
  ready(): void;
  stop(): void;
  getState(): HeartbeatState;
}

export const heartbeatServiceToken: ServiceToken<HeartbeatService> =
  createServiceToken<HeartbeatService>(
    '@nocobase/app-plugin-service-provider-example/heartbeat',
  );
