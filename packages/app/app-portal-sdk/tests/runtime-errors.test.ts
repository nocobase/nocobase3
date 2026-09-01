import { expect, it } from 'vitest';

import {
  getNocoBaseErrorDetail,
  isNocoBaseLifecycleError,
  isNocoBaseServiceError,
  NocoBaseClient,
  normalizeNocoBaseRuntimeError,
} from '../src/client/index.ts';
import { portalRuntimeStore } from '../src/runtime/index.ts';

const jsonResponse = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': `request-${status}`,
    },
  });

it('runtime errors preserve server codes', () => {
  expect(
    getNocoBaseErrorDetail({ error: { code: 'APP_COMMANDING' } })?.code,
  ).toBe('APP_COMMANDING');
  expect(
    getNocoBaseErrorDetail({ errors: [{ code: 'ROLE_NOT_FOUND_ERR' }] })?.code,
  ).toBe('ROLE_NOT_FOUND_ERR');
  expect(isNocoBaseLifecycleError({ code: 'APP_PREPARING' })).toBe(true);
  expect(isNocoBaseServiceError({ status: 504 })).toBe(true);
  expect(isNocoBaseServiceError({ status: 401 })).toBe(false);
  expect(
    normalizeNocoBaseRuntimeError(
      { code: 'APP_STOPPED', status: 503, message: 'stopped' },
      'network',
    ),
  ).toEqual({
    code: 'APP_STOPPED',
    status: 503,
    message: 'stopped',
    payload: { code: 'APP_STOPPED', status: 503, message: 'stopped' },
    source: 'network',
  });
});

it('only explicit application lifecycle responses become global runtime states', async () => {
  const originalFetch = globalThis.fetch;
  const client = new NocoBaseClient('https://example.com/api');

  try {
    portalRuntimeStore.clear();
    globalThis.fetch = async () =>
      jsonResponse(504, { message: 'report timed out' });

    await expect(client.request('reports:run')).rejects.toThrow();
    expect(portalRuntimeStore.getState().error).toBeUndefined();

    globalThis.fetch = async () =>
      jsonResponse(503, {
        error: {
          code: 'APP_PREPARING',
          maintaining: true,
          message: 'application demo is preparing',
          status: 503,
        },
      });

    await expect(client.request('reports:run')).rejects.toThrow();
    expect(portalRuntimeStore.getState().error?.code).toBe('APP_PREPARING');
    expect(portalRuntimeStore.getState().error?.status).toBe(503);
  } finally {
    globalThis.fetch = originalFetch;
    portalRuntimeStore.clear();
  }
});
