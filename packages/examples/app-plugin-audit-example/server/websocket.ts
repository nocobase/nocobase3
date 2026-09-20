import { randomUUID } from 'node:crypto';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';
import type { AppWebSocketHandler } from '@nocobase/app-websocket';
import type { ServiceResolver } from '@nocobase/service-provider';
import { customerServiceToken } from './tokens.js';
import { parseCustomerUpdate } from './input.js';
import { customerFailure } from './http-error.js';

/** App-owned message protocol; deliberately separate from Realtime subscriptions. */
export function createCustomerWebSocketHandler(
  services: ServiceResolver,
): AppWebSocketHandler {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== '/audit-example/ws') return null;
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin)
      return Response.json({ code: 'ORIGIN_FORBIDDEN' }, { status: 403 });
    const auth = services.resolve(authenticationToken);
    const session = await auth.getSession(request.headers);
    if (!session)
      return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    const connectionId = randomUUID();
    return {
      async onMessage(event, ws) {
        try {
          const current = await auth.getSession(request.headers);
          if (!current || current.user.id !== session.user.id) {
            ws.close(1008, 'Authentication required');
            return;
          }
          if (typeof event.data !== 'string' || event.data.length > 4096) {
            ws.close(1009, 'Invalid message size');
            return;
          }
          const input = parseCustomerUpdate(JSON.parse(event.data));
          const identity = services.resolve(authorizationToken).for({
            principal: { type: 'user', id: current.user.id },
            subjects: [{ type: 'authenticated', id: '*' }],
          });
          const audit = services.resolve(auditServiceToken).for({
            actor: { type: 'user', id: current.user.id },
            source: { type: 'ws', connectionId, messageId: randomUUID() },
          });
          const customer = await services
            .resolve(customerServiceToken)
            .update(identity, input, audit);
          ws.send(JSON.stringify({ data: customer }));
        } catch (error) {
          ws.send(JSON.stringify({ code: customerFailure(error).code }));
        }
      },
    };
  };
}
