import { randomUUID } from 'node:crypto';

import type {
  AppWebSocket,
  AppWebSocketMessageData,
} from '@nocobase/app-server/websocket';

import {
  encodeRealtimeServerMessage,
  parseRealtimeClientMessage,
  RealtimeProtocolError,
  validateRealtimeTopic,
  type RealtimeServerMessage,
} from './protocol.js';

const WEB_SOCKET_OPEN = 1;
const CLOSE_GOING_AWAY = 1001;

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

export interface RealtimeServiceOptions {
  maxSubscriptionsPerConnection?: number;
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

export function createRealtimeService(
  options: RealtimeServiceOptions = {},
): RealtimeService {
  const maxSubscriptionsPerConnection =
    options.maxSubscriptionsPerConnection ?? 64;
  const connections = new Map<string, RealtimeConnection>();
  const subscriptions = new Map<string, RealtimeSubscription>();
  const subscriptionsByTopic = new Map<string, Set<string>>();
  const listenersByTopic = new Map<string, Set<(count: number) => void>>();

  const service: RealtimeService = {
    connect(ws, context = {}) {
      const connection: RealtimeConnection = {
        id: randomUUID(),
        ws,
        connectedAt: new Date(),
        request: context.request,
        subscriptions: new Set(),
      };
      connections.set(connection.id, connection);
      return connection;
    },

    disconnect(connection) {
      const stored = connections.get(connection.id);
      if (!stored) {
        return;
      }

      removeConnectionSubscriptions(stored);
      connections.delete(stored.id);
    },

    subscribe(connection, topic) {
      validateRealtimeTopic(topic);

      const existing = findSubscription(connection, { topic });
      if (existing) {
        return existing;
      }

      if (connection.subscriptions.size >= maxSubscriptionsPerConnection) {
        throw new RealtimeProtocolError(
          'TOO_MANY_SUBSCRIPTIONS',
          'Realtime connection has too many subscriptions.',
        );
      }

      const subscription: RealtimeSubscription = {
        id: randomUUID(),
        connectionId: connection.id,
        topic,
        createdAt: new Date(),
      };
      subscriptions.set(subscription.id, subscription);
      connection.subscriptions.add(subscription.id);
      addTopicSubscription(subscription);
      return subscription;
    },

    unsubscribe(connection, selector) {
      const removed: RealtimeSubscription[] = [];

      for (const subscriptionId of Array.from(connection.subscriptions)) {
        const subscription = subscriptions.get(subscriptionId);
        if (!subscription || !matchesSubscription(subscription, selector)) {
          continue;
        }

        removeSubscription(connection, subscription);
        removed.push(subscription);
      }

      return removed;
    },

    handleClientMessage(connection, data) {
      let message;
      try {
        message = parseRealtimeClientMessage(data);
      } catch (error) {
        sendProtocolError(connection, error);
        return;
      }

      try {
        switch (message.type) {
          case 'subscribe': {
            const subscription = service.subscribe(connection, message.topic);
            send(connection, {
              type: 'subscribed',
              id: message.id,
              topic: subscription.topic,
              subscriptionId: subscription.id,
            });
            return;
          }
          case 'unsubscribe': {
            const removed = service.unsubscribe(connection, {
              subscriptionId: message.subscriptionId,
              topic: message.topic,
            });
            const first = removed[0];
            send(connection, {
              type: 'unsubscribed',
              id: message.id,
              subscriptionId: message.subscriptionId ?? first?.id,
              topic: message.topic ?? first?.topic,
            });
            return;
          }
          case 'publish':
            send(connection, {
              type: 'error',
              id: message.id,
              code: 'PUBLISH_FORBIDDEN',
              message: 'Client publish is not allowed.',
            });
            return;
          case 'ping':
            send(connection, {
              type: 'pong',
              id: message.id,
            });
            return;
        }
      } catch (error) {
        sendProtocolError(connection, error);
      }
    },

    publish(topic, payload) {
      validateRealtimeTopic(topic);

      const subscriptionIds = subscriptionsByTopic.get(topic);
      if (!subscriptionIds?.size) {
        return {
          topic,
          subscriberCount: 0,
        };
      }

      const message: RealtimeServerMessage = {
        type: 'event',
        topic,
        payload,
        publishedAt: new Date().toISOString(),
      };
      const sentConnections = new Set<string>();

      for (const subscriptionId of Array.from(subscriptionIds)) {
        const subscription = subscriptions.get(subscriptionId);
        const connection = subscription
          ? connections.get(subscription.connectionId)
          : undefined;
        if (
          !subscription ||
          !connection ||
          sentConnections.has(connection.id)
        ) {
          continue;
        }

        if (connection.ws.readyState !== WEB_SOCKET_OPEN) {
          service.disconnect(connection);
          continue;
        }

        sentConnections.add(connection.id);
        send(connection, message);
      }

      return {
        topic,
        subscriberCount: sentConnections.size,
      };
    },

    subscriptionCount(topic) {
      return subscriptionsByTopic.get(topic)?.size ?? 0;
    },

    onTopicSubscriptionChange(topic, listener) {
      validateRealtimeTopic(topic);

      const listeners =
        listenersByTopic.get(topic) ?? new Set<(count: number) => void>();
      listeners.add(listener);
      listenersByTopic.set(topic, listeners);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByTopic.delete(topic);
        }
      };
    },

    close() {
      for (const connection of Array.from(connections.values())) {
        if (connection.ws.readyState === WEB_SOCKET_OPEN) {
          connection.ws.close(CLOSE_GOING_AWAY, 'realtime service closed');
        }

        service.disconnect(connection);
      }

      subscriptions.clear();
      subscriptionsByTopic.clear();
      listenersByTopic.clear();
    },
  };

  function findSubscription(
    connection: RealtimeConnection,
    selector: { subscriptionId?: string; topic?: string },
  ): RealtimeSubscription | undefined {
    for (const subscriptionId of connection.subscriptions) {
      const subscription = subscriptions.get(subscriptionId);
      if (subscription && matchesSubscription(subscription, selector)) {
        return subscription;
      }
    }

    return undefined;
  }

  function matchesSubscription(
    subscription: RealtimeSubscription,
    selector: { subscriptionId?: string; topic?: string },
  ): boolean {
    return (
      (selector.subscriptionId === undefined ||
        subscription.id === selector.subscriptionId) &&
      (selector.topic === undefined || subscription.topic === selector.topic)
    );
  }

  function addTopicSubscription(subscription: RealtimeSubscription): void {
    const previousCount = service.subscriptionCount(subscription.topic);
    const topicSubscriptions =
      subscriptionsByTopic.get(subscription.topic) ?? new Set<string>();
    topicSubscriptions.add(subscription.id);
    subscriptionsByTopic.set(subscription.topic, topicSubscriptions);
    notifyTopicSubscriptionChange(subscription.topic, previousCount);
  }

  function removeConnectionSubscriptions(connection: RealtimeConnection): void {
    for (const subscriptionId of Array.from(connection.subscriptions)) {
      const subscription = subscriptions.get(subscriptionId);
      if (subscription) {
        removeSubscription(connection, subscription);
      }
    }
  }

  function removeSubscription(
    connection: RealtimeConnection,
    subscription: RealtimeSubscription,
  ): void {
    const previousCount = service.subscriptionCount(subscription.topic);
    connection.subscriptions.delete(subscription.id);
    subscriptions.delete(subscription.id);

    const topicSubscriptions = subscriptionsByTopic.get(subscription.topic);
    topicSubscriptions?.delete(subscription.id);
    if (topicSubscriptions?.size === 0) {
      subscriptionsByTopic.delete(subscription.topic);
    }
    notifyTopicSubscriptionChange(subscription.topic, previousCount);
  }

  function notifyTopicSubscriptionChange(
    topic: string,
    previousCount: number,
  ): void {
    const count = service.subscriptionCount(topic);
    if (count === previousCount) {
      return;
    }

    const listeners = listenersByTopic.get(topic);
    if (!listeners) {
      return;
    }

    for (const listener of Array.from(listeners)) {
      try {
        listener(count);
      } catch (error) {
        console.error(error);
      }
    }
  }

  function sendProtocolError(
    connection: RealtimeConnection,
    error: unknown,
  ): void {
    const code =
      error instanceof RealtimeProtocolError ? error.code : 'REALTIME_ERROR';
    const message =
      error instanceof Error ? error.message : 'Realtime message failed.';
    send(connection, {
      type: 'error',
      code,
      message,
    });
  }

  function send(
    connection: RealtimeConnection,
    message: RealtimeServerMessage,
  ): void {
    if (connection.ws.readyState !== WEB_SOCKET_OPEN) {
      service.disconnect(connection);
      return;
    }

    connection.ws.send(encodeRealtimeServerMessage(message));
  }

  return service;
}
