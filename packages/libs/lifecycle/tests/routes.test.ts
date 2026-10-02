// The standard routes, through Hono's own request handling.
import { describe, expect, it } from 'vitest';

import { routesApp } from './support/routes-app.js';

function post(path: string, actor: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-actor': actor },
    body: JSON.stringify(body),
  });
}

function get(path: string, actor: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { 'x-actor': actor },
  });
}

describe('createLifecycleRoutes', () => {
  it('describes a lifecycle with its parameters and diagram', async () => {
    const { app } = routesApp();
    const response = await app.request(get('/tickets', 'agent'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      description: { name: 'tickets', initial: 'open' },
      parameters: { waitHours: 72 },
    });
    expect(body.diagram).toContain('stateDiagram-v2');
  });

  it('shows a record with what the actor may do, and why not', async () => {
    const { app, id } = routesApp();
    const response = await app.request(get(`/tickets/${id}`, 'stranger'));
    expect(await response.json()).toMatchObject({
      record: { status: 'open' },
      state: 'open',
      version: 0,
      available: expect.arrayContaining([
        expect.objectContaining({ name: 'close', allowed: false }),
      ]),
      history: { transitions: [], effectRuns: [] },
    });
  });

  it('fires a transition and answers the record as it left it', async () => {
    const { app, id, sent } = routesApp();
    const response = await app.request(
      post(`/tickets/${id}/fire`, 'agent', {
        transition: 'replyToCustomer',
        input: { message: 'Hello' },
        requestId: 'click-1',
        expectVersion: 0,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: 'awaitingCustomer',
      version: 1,
      replayed: false,
    });
    expect(sent).toEqual(['a@example.com']);
    const again = await app.request(
      post(`/tickets/${id}/fire`, 'agent', {
        transition: 'replyToCustomer',
        input: { message: 'Hello' },
        requestId: 'click-1',
      }),
    );
    expect(await again.json()).toMatchObject({ replayed: true, version: 1 });
    expect(sent).toHaveLength(1);
  });

  it('answers refusals with their reasons and a fitting status', async () => {
    const { app, id } = routesApp();
    const refused = await app.request(
      post(`/tickets/${id}/fire`, 'stranger', { transition: 'close' }),
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({
      code: 'GUARD_REJECTED',
      blockers: [{ source: 'guard' }],
    });
    const stale = await app.request(
      post(`/tickets/${id}/fire`, 'agent', {
        transition: 'close',
        expectVersion: 5,
      }),
    );
    expect(stale.status).toBe(409);
    expect(
      (
        await app.request(
          post(`/tickets/${id}/fire`, 'agent', { transition: 'fly' }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await app.request(post(`/tickets/${id}/fire`, 'agent', {}))).status,
    ).toBe(400);
    expect((await app.request(get('/tickets/999', 'agent'))).status).toBe(404);
  });

  it('exposes only the lifecycles it is given, and lets authorize refuse', async () => {
    const hidden = routesApp({ lifecycles: [] });
    expect((await hidden.app.request(get('/tickets', 'agent'))).status).toBe(
      404,
    );
    const guarded = routesApp({
      authorize: (access, actor) =>
        access.action !== 'fire' || actor.id === 'agent',
    });
    const response = await guarded.app.request(
      post(`/tickets/${guarded.id}/fire`, 'customer', { transition: 'close' }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets only an operator act on a run, and only on a run of that record', async () => {
    const { app, id, runtime, store } = routesApp({
      authorize: (access, actor) =>
        access.action !== 'operate' || actor.id === 'operator',
    });
    await runtime.fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'Hi' },
    });
    const [run] = (await runtime.history('tickets', id)).effectRuns;
    expect(
      (
        await app.request(
          post(`/tickets/${id}/runs/${run!.id}/retry`, 'agent', {}),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          post(`/tickets/${id}/runs/${run!.id}/retry`, 'operator', {}),
        )
      ).status,
      // It succeeded: there is nothing to retry.
    ).toBe(409);
    const other = store.insertRecord('tickets', {
      customerEmail: 'b@example.com',
      status: 'open',
      statusChangedAt: '2026-10-01T09:00:00.000Z',
      lifecycleVersion: 0,
    });
    expect(
      (
        await app.request(
          post(
            `/tickets/${String(other.id)}/runs/${run!.id}/cancel`,
            'operator',
            {},
          ),
        )
      ).status,
    ).toBe(404);
  });
});
