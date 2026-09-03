import type { AppWebSocket, AppWebSocketMessageData } from '../websocket.js';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface RealtimeConnectionContext {
  request?: Request;
  principal?: RealtimePrincipal;
}

export interface RealtimePrincipal {
  readonly userId: string;
}

export interface RealtimePrincipalResolver {
  resolve(request: Request): Promise<RealtimePrincipal | undefined>;
}

export interface RealtimeConnection {
  readonly id: string;
  readonly ws: AppWebSocket;
  readonly connectedAt: Date;
  readonly request?: Request;
  readonly principal?: RealtimePrincipal;
  readonly subscriptions: Set<string>;
}

export interface RealtimeSubscription {
  readonly id: string;
  readonly connectionId: string;
  readonly topic: string;
  readonly userId?: string;
  readonly createdAt: Date;
}

export interface RealtimePublishResult {
  readonly topic: string;
  readonly subscriberCount: number;
}

export type RealtimeTopicAudience = 'public' | 'user';

export interface RealtimeTopicOptions {
  readonly audience: RealtimeTopicAudience;
}

export interface RealtimePublishOptions {
  readonly userId?: string;
}

export interface RealtimeTopicBase {
  readonly name: string;
  close(): void;
}

export interface RealtimePublicTopic<Payload> extends RealtimeTopicBase {
  readonly audience: 'public';
  publish(payload: Payload): RealtimePublishResult;
}

export interface RealtimeUserTopic<Payload> extends RealtimeTopicBase {
  readonly audience: 'user';
  publishFor(userId: string, payload: Payload): RealtimePublishResult;
}

export type DefinedRealtimeTopic<
  Payload,
  Audience extends RealtimeTopicAudience,
> = Audience extends 'user'
  ? RealtimeUserTopic<Payload>
  : RealtimePublicTopic<Payload>;

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
  registerTopic(topic: string, options: RealtimeTopicOptions): () => void;
  defineTopic<Payload, Audience extends RealtimeTopicAudience>(
    topic: string,
    options: { readonly audience: Audience },
  ): DefinedRealtimeTopic<Payload, Audience>;
  publish(
    topic: string,
    payload: unknown,
    options?: RealtimePublishOptions,
  ): RealtimePublishResult;
  subscriptionCount(topic: string): number;
  onTopicSubscriptionChange(
    topic: string,
    listener: (count: number) => void,
  ): () => void;
  close(): void;
}

export const realtimeServiceToken: ServiceToken<RealtimeService> =
  createServiceToken<RealtimeService>('@nocobase/app/realtime-service');

export const realtimePrincipalResolverToken: ServiceToken<RealtimePrincipalResolver> =
  createServiceToken<RealtimePrincipalResolver>(
    '@nocobase/app/realtime-principal-resolver',
  );
