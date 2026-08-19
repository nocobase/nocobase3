import type { NocoBaseSessionManager, SessionData } from '@nocobase/session';
import {
  createMemoryPortalLivePublisher,
  createPortalLiveConnection,
  type PortalLiveAuthenticator,
  type PortalLiveConnection,
  type PortalLivePrincipal,
  type PortalLivePublisher,
  type PortalLiveSocket,
} from '../../registry/portal-live/server/index.js';

export interface PortalLiveServiceOptions {
  readonly appId: string;
  readonly sessionManager: NocoBaseSessionManager;
  readonly resolveUserId?: (data: SessionData) => string | undefined;
}

export interface PortalLiveService {
  readonly publisher: PortalLivePublisher;
  createConnection(socket: PortalLiveSocket, cookieValue: string | undefined): PortalLiveConnection;
  drain(): void;
}

export function createPortalLiveService(options: PortalLiveServiceOptions): PortalLiveService {
  const publisher = createMemoryPortalLivePublisher();
  const resolveUserId = options.resolveUserId ?? resolveSessionUserId;
  const connections = new Set<PortalLiveConnection>();
  let drained = false;

  return {
    publisher,
    createConnection(socket: PortalLiveSocket, cookieValue: string | undefined): PortalLiveConnection {
      if (drained) {
        socket.close(1001, 'server draining');
        return createClosedConnection(socket);
      }
      const authenticator: PortalLiveAuthenticator = {
        async authenticate(token: string | undefined): Promise<PortalLivePrincipal | undefined> {
          const session = options.sessionManager.createRequestSession({ cookieValue: token ?? cookieValue });
          const data = await session.get();
          if (!data) return undefined;
          const userId = resolveUserId(data);
          return userId ? { appId: options.appId, userId } : undefined;
        },
      };
      const connection = createPortalLiveConnection({ socket, publisher, authenticator });
      connections.add(connection);
      socket.onClose(() => connections.delete(connection));
      return connection;
    },
    drain(): void {
      if (drained) return;
      drained = true;
      for (const connection of connections) connection.drain();
      connections.clear();
    },
  };
}

export function resolveSessionUserId(data: SessionData): string | undefined {
  const user = (data as { user?: { id?: unknown } }).user;
  if (user && typeof user.id === 'string') return user.id;
  const userId = (data as { userId?: unknown }).userId;
  return typeof userId === 'string' ? userId : undefined;
}

function createClosedConnection(socket: PortalLiveSocket): PortalLiveConnection {
  return {
    principal: undefined,
    closed: true,
    close: () => socket.close(1001, 'server draining'),
    drain: () => socket.close(1001, 'server draining'),
  };
}
