// The hook against the real routes: a page's view of one record.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  createLifecycleClient,
  LifecycleRequestError,
  useLifecycle,
} from '../../src/react.js';
import { routesApp } from '../support/routes-app.js';

function setup(actor: string) {
  const app = routesApp();
  const client = createLifecycleClient({
    transport: app.transport(actor),
    basePath: '/',
  });
  return { ...app, client };
}

describe('useLifecycle', () => {
  it('loads the record and its description, and nothing while none is selected', async () => {
    const { client, id } = setup('agent');
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string | undefined }) =>
        useLifecycle(client, 'tickets', selected, { refreshMs: 0 }),
      { initialProps: { selected: undefined as string | undefined } },
    );
    await waitFor(() => expect(result.current.description).toBeDefined());
    expect(result.current.view).toBeUndefined();
    rerender({ selected: id });
    await waitFor(() =>
      expect(result.current.view?.record.status).toBe('open'),
    );
    expect(result.current.description?.diagram).toContain('stateDiagram-v2');
  });

  it('fires with the version on screen and shows the record as it left it', async () => {
    const { client, id, sent } = setup('agent');
    const { result } = renderHook(() =>
      useLifecycle(client, 'tickets', id, { refreshMs: 0 }),
    );
    await waitFor(() => expect(result.current.view).toBeDefined());
    await act(async () => {
      await result.current.fire('replyToCustomer', { message: 'Hello' });
    });
    expect(result.current.view).toMatchObject({
      state: 'awaitingCustomer',
      version: 1,
    });
    expect(sent).toEqual(['a@example.com']);
  });

  it('rejects a refused fire with its reasons', async () => {
    const { client, id } = setup('stranger');
    const { result } = renderHook(() =>
      useLifecycle(client, 'tickets', id, { refreshMs: 0 }),
    );
    await waitFor(() => expect(result.current.view).toBeDefined());
    let refusal: unknown;
    await act(async () => {
      refusal = await result.current.fire('close').catch((error) => error);
    });
    expect(refusal).toBeInstanceOf(LifecycleRequestError);
    expect(refusal).toMatchObject({
      code: 'GUARD_REJECTED',
      blockers: [{ source: 'guard' }],
    });
    expect(result.current.busy).toBe(false);
  });

  it('refuses a fire made on a screen that is out of date', async () => {
    const { client, id, runtime } = setup('agent');
    const { result } = renderHook(() =>
      useLifecycle(client, 'tickets', id, { refreshMs: 0 }),
    );
    await waitFor(() => expect(result.current.view).toBeDefined());
    // Someone else replies while this page still shows version 0.
    await runtime.fire('tickets', id, 'replyToCustomer', {
      actor: { id: 'agent' },
      input: { message: 'First' },
    });
    let refusal: unknown;
    await act(async () => {
      refusal = await result.current.fire('close').catch((error) => error);
    });
    expect(refusal).toMatchObject({ code: 'CONFLICT' });
  });
});
