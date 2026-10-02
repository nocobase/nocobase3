// A runtime with the ticket fixture behind createLifecycleRoutes(), and a
// transport that sends a client's requests straight to it.
import {
  LifecycleRuntime,
  MemoryLifecycleStore,
  type LifecycleActor,
} from '../../src/index.js';
import {
  createLifecycleRoutes,
  type LifecycleRoutesOptions,
} from '../../src/hono.js';
import type { LifecycleRequest, LifecycleTransport } from '../../src/react.js';
import { ticketLifecycle } from '../fixtures/ticket.js';

export function routesApp(options: Partial<LifecycleRoutesOptions> = {}) {
  const store = new MemoryLifecycleStore();
  const sent: string[] = [];
  const runtime = new LifecycleRuntime({ store });
  runtime.register(ticketLifecycle, {
    services: { mail: { send: (to) => void sent.push(to) } },
  });
  const app = createLifecycleRoutes(runtime, {
    // The tests say who they are in a header; an application reads its session.
    actor: (context): LifecycleActor => ({
      id: context.req.header('x-actor') ?? 'anonymous',
    }),
    ...options,
  });
  const ticket = store.insertRecord('tickets', {
    customerEmail: 'a@example.com',
    status: 'open',
    statusChangedAt: '2026-10-01T09:00:00.000Z',
    lifecycleVersion: 0,
  });
  const transport = (actor: string): LifecycleTransport => ({
    async request<T>(request: LifecycleRequest): Promise<T> {
      const query = new URLSearchParams(request.query ?? {}).toString();
      const response = await app.request(
        `/${request.path.replace(/^\//, '')}${query ? `?${query}` : ''}`,
        {
          method: request.method ?? 'GET',
          headers: { 'content-type': 'application/json', 'x-actor': actor },
          ...(request.json === undefined
            ? {}
            : { body: JSON.stringify(request.json) }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok)
        throw Object.assign(new Error(`HTTP ${response.status}`), {
          payload: body,
        });
      return body as T;
    },
  });
  return { app, runtime, store, sent, id: String(ticket.id), transport };
}
