import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HubApiError,
  HubClient,
  normalizeHubUrl,
} from '../src/lib/hub-client.ts';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Hub client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the configured app base path and derives the API path from it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ data: [], meta: { total: 0, limit: 20, offset: 0 } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new HubClient('https://hub.example.com/hub/', {
      accessToken: 'token',
    });
    await client.listApplications();

    expect(normalizeHubUrl('https://hub.example.com/hub/')).toBe(
      'https://hub.example.com/hub',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hub.example.com/hub/api/apps?limit=20&offset=0',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends bearer credentials only to authenticated API calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          { data: { deviceCode: 'd', userCode: 'U', interval: 1 } },
          201,
        ),
      )
      .mockResolvedValueOnce(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('http://localhost:13000/hub', {
      accessToken: 'secret-token',
    });

    await client.createDeviceAuthorization({
      clientId: 'nb3-cli',
      clientName: 'test',
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    });
    await client.listApplications();

    expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({
      headers: expect.objectContaining({ authorization: expect.anything() }),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: 'Bearer secret-token',
      }),
    });
  });

  it('turns the Hub error envelope into an actionable typed error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              code: 'INSUFFICIENT_SCOPE',
              message:
                'Agent credential scope does not allow this application.',
              retryable: false,
            },
            requestId: 'req-1',
          },
          403,
        ),
      ),
    );
    const client = new HubClient('http://localhost:13000/hub', {
      accessToken: 'token',
    });

    await expect(client.listApplications()).rejects.toMatchObject<
      Partial<HubApiError>
    >({
      code: 'INSUFFICIENT_SCOPE',
      requestId: 'req-1',
      status: 403,
      retryable: false,
    });
  });
});
