import { afterEach, describe, expect, it, vi } from 'vitest';

import { HubClient } from '../src/lib/hub-client.ts';
import { listAllReleases } from '../src/lib/hub-workflow.ts';

function response(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify({ data, meta: {}, requestId: 'req-1' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Hub client application workflows', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates an application with a reusable idempotency key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ id: 'app-1', slug: 'sales', name: 'Sales' }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('https://hub.example.com/hub', {
      accessToken: 'secret',
    });

    await client.createApplication(
      { slug: 'sales', name: 'Sales', description: 'CRM' },
      'operation-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hub.example.com/hub/api/apps',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret',
          'idempotency-key': 'operation-1',
        }),
        body: JSON.stringify({
          slug: 'sales',
          name: 'Sales',
          description: 'CRM',
        }),
      }),
    );
  });

  it('creates, uploads, completes, and observes a release upload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            id: 'upload-1',
            applicationId: 'app-1',
            status: 'created',
            upload: {
              method: 'PUT',
              url: 'https://hub.example.com/hub/api/release-uploads/upload-1/content',
              auth: { mode: 'hub-bearer' },
              headers: { 'Content-Type': 'application/gzip' },
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        response({ id: 'upload-1', status: 'verifying' }, 202),
      )
      .mockResolvedValueOnce(
        response({
          id: 'upload-1',
          status: 'completed',
          release: { id: 'release-1', version: '1.0.0' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('https://hub.example.com/hub', {
      accessToken: 'secret',
    });
    const input = {
      version: '1.0.0',
      checksum: `sha256:${'b'.repeat(64)}`,
      sizeBytes: 3,
      archiveChecksum: `sha256:${'c'.repeat(64)}`,
      archiveSizeBytes: 3,
      archiveFormat: 'tar.gz' as const,
      manifest: { schemaVersion: 1 },
    };

    const upload = await client.createReleaseUpload(
      'app-1',
      input,
      'operation-1',
    );
    await client.putReleaseUploadContent(upload, new Uint8Array([1, 2, 3]));
    await client.completeReleaseUpload(upload.id);
    const completed = await client.getReleaseUpload(upload.id);

    expect(completed.status).toBe('completed');
    expect(fetchMock.mock.calls[1]).toEqual([
      upload.upload.url,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          authorization: 'Bearer secret',
          'content-length': '3',
          'content-type': 'application/gzip',
        }),
      }),
    ]);
  });

  it('refuses to send a bearer credential to an untrusted upload URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('https://hub.example.com/hub', {
      accessToken: 'secret',
    });

    await expect(
      client.putReleaseUploadContent(
        {
          id: 'upload-1',
          applicationId: 'app-1',
          status: 'created',
          version: '1.0.0',
          upload: {
            method: 'PUT',
            url: 'https://attacker.example/upload',
            auth: { mode: 'hub-bearer' },
          },
        },
        new Uint8Array([1]),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_HUB_RESPONSE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a deployment and reads its terminal state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            id: 'deployment-1',
            applicationId: 'app-1',
            targetReleaseId: 'release-1',
            type: 'deploy',
            status: 'queued',
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          id: 'deployment-1',
          applicationId: 'app-1',
          targetReleaseId: 'release-1',
          type: 'deploy',
          status: 'succeeded',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('https://hub.example.com/hub', {
      accessToken: 'secret',
    });

    const deployment = await client.createDeployment(
      'app-1',
      { targetReleaseId: 'release-1', type: 'deploy' },
      'operation-1',
    );
    const completed = await client.getDeployment(deployment.id);

    expect(completed.status).toBe('succeeded');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'idempotency-key': 'operation-1',
      }),
    });
  });

  it('reads every Release page for version and deployment resolution', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `release-${index}`,
      applicationId: 'app-1',
      version: `1.0.${index}`,
    }));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/apps/app-1/releases?limit=100&offset=0')) {
        return response(firstPage);
      }
      if (url.endsWith('/api/apps/app-1/releases?limit=100&offset=100')) {
        return response([
          { id: 'release-100', applicationId: 'app-1', version: '2.0.0' },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('https://hub.example.com/hub', {
      accessToken: 'secret',
    });

    const releases = await listAllReleases(client, 'app-1');

    expect(releases).toHaveLength(101);
    expect(releases.at(-1)).toMatchObject({ id: 'release-100' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast when a Hub repeats a full Release page', async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({
      id: `release-${index}`,
      applicationId: 'app-1',
      version: `1.0.${index}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(response(page));
    vi.stubGlobal('fetch', fetchMock);
    const client = new HubClient('https://hub.example.com/hub', {
      accessToken: 'secret',
    });

    await expect(listAllReleases(client, 'app-1')).rejects.toMatchObject({
      code: 'INVALID_HUB_RESPONSE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
