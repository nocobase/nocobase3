import { createServer, type Server } from 'node:http';

import { expect, test, type Page, type Route } from '@playwright/test';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('uploads, replaces, previews, downloads, and detaches through basePath', async ({
  page,
}) => {
  const uploadServer = await startUploadServer();
  let releaseComplete: () => void = () => undefined;
  const completeGate = new Promise<void>((resolve) => {
    releaseComplete = resolve;
  });
  const contentMethods: string[] = [];
  await installFilesRoutes(page, {
    ids: ['replacement-file'],
    completeGate,
    contentMethods,
    uploadBaseUrl: uploadServer.baseUrl,
  });
  try {
    await page.goto('e2e/files.html?seed=1');

    await expect(page.getByTestId('file-ids')).toHaveText('seed-file');
    await page.getByLabel('Choose file').setInputFiles({
      name: 'replacement.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(512 * 1024, 1),
    });
    await expect(
      page.locator('[data-slot="file-upload-field"]'),
    ).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('upload-progress')).toHaveText('100');
    await expect(page.getByText('seed.png', { exact: true })).toBeVisible();
    releaseComplete();

    await expect(page.getByTestId('file-ids')).toHaveText('replacement-file');
    await expect(
      page.getByText('replacement.png', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Preview: replacement.png' })
      .click();
    await expect(page.locator('[data-file-preview-dialog]')).toBeVisible();
    await page.getByRole('button', { name: 'Download' }).click();
    await expect.poll(() => contentMethods).toContain('HEAD');
    await page.getByRole('button', { name: 'Close' }).click();

    await page
      .locator('[data-slot="file-upload-field"]')
      .getByText('replacement.png', { exact: true })
      .hover();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('file-ids')).toHaveText('');
  } finally {
    await uploadServer.close();
  }
});

test('aborts an active upload and retries failure with a fresh file ID', async ({
  page,
}) => {
  const cancelIds: string[] = [];
  await installFilesRoutes(page, {
    ids: ['abort-file', 'failed-file', 'retry-file'],
    delayedUploadId: 'abort-file',
    failedUploadId: 'failed-file',
    cancelIds,
  });
  await page.goto('e2e/files.html');

  await page.getByLabel('Choose file').setInputFiles({
    name: 'abort.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('abort'),
  });
  await expect(page.locator('[data-slot="file-upload-field"]')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await page
    .locator('[data-slot="file-upload-field"]')
    .getByText('abort.txt', { exact: true })
    .first()
    .hover();
  await page.getByRole('button', { name: 'Cancel' }).click({ force: true });
  await expect(page.getByLabel('Cancelled')).toBeVisible();
  await expect.poll(() => cancelIds).toContain('abort-file');
  await page
    .locator('[data-slot="file-upload-field"]')
    .getByText('abort.txt', { exact: true })
    .first()
    .hover();
  await page.getByRole('button', { name: 'Remove' }).click();

  await page.getByLabel('Choose file').setInputFiles({
    name: 'retry.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('retry'),
  });
  await expect(page.getByLabel('Failed')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click({ force: true });
  await expect(page.getByTestId('file-ids')).toHaveText('retry-file');
  await expect.poll(() => cancelIds).toContain('failed-file');
});

test('keeps readOnly files previewable without mutation controls', async ({
  page,
}) => {
  await installFilesRoutes(page, { ids: [], contentMethods: [] });
  await page.goto('e2e/files.html?seed=1&readOnly=1');

  await expect(page.getByTestId('file-ids')).toHaveText('seed-file');
  await expect(page.getByLabel('Choose file')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview: seed.png' }).click();
  await expect(page.locator('[data-file-preview-dialog]')).toBeVisible();
});

interface FilesRouteOptions {
  ids: string[];
  completeGate?: Promise<void>;
  delayedUploadId?: string;
  failedUploadId?: string;
  cancelIds?: string[];
  contentMethods?: string[];
  uploadBaseUrl?: string;
}

async function installFilesRoutes(
  page: Page,
  options: FilesRouteOptions,
): Promise<void> {
  let createIndex = 0;
  const files = new Map<string, ReturnType<typeof readyFile>>([
    ['seed-file', readyFile('seed-file', 'seed.png', 'image/png', 68)],
  ]);

  await page.route('**/business/record/files**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const filesIndex = segments.lastIndexOf('files');
    const fileId =
      filesIndex >= 0 && filesIndex + 1 < segments.length
        ? decodeURIComponent(segments[filesIndex + 1] ?? '')
        : undefined;
    if (request.method() === 'POST' && !fileId) {
      const id = options.ids[createIndex++];
      if (!id) {
        await route.fulfill({ status: 500, body: 'Unexpected upload create' });
        return;
      }
      const body = request.postDataJSON() as {
        name: string;
        size: number;
        contentType?: string;
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          file: {
            ...readyFile(id, body.name, body.contentType ?? null, body.size),
            status: 'pending',
            size: null,
          },
          plan: {
            fileId: id,
            expiresAt: '2026-08-24T00:15:00.000Z',
            upload: {
              method: 'PUT',
              url: options.uploadBaseUrl
                ? `${options.uploadBaseUrl}/${id}`
                : `e2e-upload/${id}`,
            },
            complete: { method: 'POST', url: `e2e-complete/${id}` },
            cancel: { method: 'DELETE', url: `e2e-cancel/${id}` },
          },
        }),
      });
      return;
    }
    if (request.method() === 'DELETE' && fileId) {
      files.delete(fileId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    if (fileId && segments.at(-1) === 'content') {
      options.contentMethods?.push(request.method());
      await fulfillContent(route, request.method());
      return;
    }
    await route.fulfill({ status: 404 });
  });

  await page.route('**/e2e-upload/*', async (route) => {
    const id = route.request().url().split('/').at(-1) ?? '';
    if (id === options.delayedUploadId) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    if (id === options.failedUploadId) {
      await route.fulfill({ status: 500, body: 'Upload failed' });
      return;
    }
    await route.fulfill({ status: 204 });
  });

  await page.route('**/e2e-complete/*', async (route) => {
    const id = route.request().url().split('/').at(-1) ?? '';
    if (options.completeGate) await options.completeGate;
    const name = id === 'replacement-file' ? 'replacement.png' : 'retry.txt';
    const file = readyFile(
      id,
      name,
      name.endsWith('.png') ? 'image/png' : 'text/plain',
      name.endsWith('.png') ? 68 : 5,
    );
    files.set(id, file);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ file }),
    });
  });

  await page.route('**/e2e-cancel/*', async (route) => {
    const id = route.request().url().split('/').at(-1) ?? '';
    options.cancelIds?.push(id);
    await route.fulfill({ status: 200 });
  });
}

async function startUploadServer(): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> {
  const server = createServer((request, response) => {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT, OPTIONS',
      'access-control-allow-headers':
        request.headers['access-control-request-headers'] ?? 'content-type',
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders).end();
      return;
    }
    request.on('data', () => undefined);
    request.on('end', () => response.writeHead(204, corsHeaders).end());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Files upload E2E server did not bind a TCP port.');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/upload`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function fulfillContent(route: Route, method: string): Promise<void> {
  if (method === 'HEAD') {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '68' },
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: TINY_PNG,
  });
}

function readyFile(
  id: string,
  name: string,
  contentType: string | null,
  size: number,
) {
  return {
    id,
    status: 'ready' as const,
    name,
    size,
    contentType,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}
