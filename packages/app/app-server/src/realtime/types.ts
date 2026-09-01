import type {
  AppWebSocket,
  AppWebSocketMessageData,
} from '@nocobase/app-websocket';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface RealtimeConnectionContext {
  request?: Request;
}

export interface RealtimeConnection {
  readonly id: string;
  readonly ws: AppWebSocket;
  readonly connectedAt: Date;
  readonly request?: Request;
  readonly subscriptions: Set<string>;
}

export interface RealtimeSubscription {
  readonly id: string;
  readonly connectionId: string;
  readonly topic: string;
  readonly createdAt: Date;
}

export interface RealtimePublishResult {
  topic: string;
  subscriberCount: number;
}

export interface RealtimeService {
  connect(
    ws: AppWebSocket,
    context?: RealtimeConnectionContext,
  ): RealtimeConnection;
  disconnect(connection: RealtimeConnection): void;
  subscribe(
    connection: RealtimeConnection,
    topic: string,
  ): RealtimeSubscription;
  unsubscribe(
    connection: RealtimeConnection,
    selector: { subscriptionId?: string; topic?: string },
  ): RealtimeSubscription[];
  handleClientMessage(
    connection: RealtimeConnection,
    data: AppWebSocketMessageData,
  ): void;
  publish(topic: string, payload: unknown): RealtimePublishResult;
  subscriptionCount(topic: string): number;
  onTopicSubscriptionChange(
    topic: string,
    listener: (count: number) => void,
  ): () => void;
  close(): void;
}

export const realtimeServiceToken: ServiceToken<RealtimeService> =
  createServiceToken<RealtimeService>('@nocobase/app/realtime-service');
