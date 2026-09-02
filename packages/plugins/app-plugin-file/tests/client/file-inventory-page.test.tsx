import type { AppClient } from '@nocobase/app-client';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { client, request } = vi.hoisted(() => {
  const stableRequest = vi.fn();
  return {
    client: { request: stableRequest },
    request: stableRequest,
  };
});

vi.mock('@nocobase/app-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nocobase/app-client')>();
  return {
    ...actual,
    useService: (): AppClient => client,
  };
});

import FileInventoryPage from '../../client/pages/file-inventory-page.js';
import clientLocales from '../../client/locales/index.js';
import { FILE_PLUGIN_NS } from '../../shared/namespace.js';
import type {
  FileInventoryFilesResponse,
  FileInventorySourcesResponse,
} from '../../shared/inventory.js';
import { createFileI18nRuntime } from '../i18n.js';

describe('file inventory page', () => {
  it('keeps the current files when the selected source is clicked again', async () => {
    request.mockImplementation(async (path: string) => {
      if (path === 'files/inventory/sources') return sourcesResponse('alpha');
      if (path.includes('/alpha/files')) return filesResponse('alpha.pdf');
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    await renderPage();

    expect(await screen.findByText('alpha.pdf')).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: /alpha/i }));

    expect(screen.getByText('alpha.pdf')).toBeVisible();
    expect(screen.queryByText('Loading files...')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('resets pagination when refresh replaces the selected source', async () => {
    let sourceLoad = 0;
    request.mockImplementation(async (path: string) => {
      if (path === 'files/inventory/sources') {
        sourceLoad += 1;
        return sourceLoad === 1
          ? sourcesResponse('alpha')
          : sourcesResponse('beta');
      }
      if (
        path.includes('/alpha/files?pageSize=25') &&
        !path.includes('cursor=')
      ) {
        return filesResponse('alpha-page-1.pdf', 1, true);
      }
      if (path.includes('/alpha/files?pageSize=25&cursor=alpha-page-1.pdf')) {
        return filesResponse('alpha-page-2.pdf', 2);
      }
      if (
        path.includes('/beta/files?pageSize=25') &&
        !path.includes('cursor=')
      ) {
        return filesResponse('beta-page-1.pdf');
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    await renderPage();

    expect(await screen.findByText('alpha-page-1.pdf')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('alpha-page-2.pdf')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('beta-page-1.pdf')).toBeVisible();
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/beta/files?pageSize=25'),
      expect.anything(),
    );
    expect(
      request.mock.calls.some(
        ([path]) =>
          String(path).includes('/beta/files?') &&
          String(path).includes('cursor='),
      ),
    ).toBe(false);
  });

  it('ignores a stale file response after selecting another source', async () => {
    const alpha = deferred<FileInventoryFilesResponse>();
    request.mockImplementation(async (path: string) => {
      if (path === 'files/inventory/sources') {
        return {
          data: [
            { id: 'alpha', table: 'alpha' },
            { id: 'beta', table: 'beta' },
          ],
        } satisfies FileInventorySourcesResponse;
      }
      if (path.includes('/alpha/files')) return alpha.promise;
      if (path.includes('/beta/files')) return filesResponse('beta.pdf');
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    await renderPage();

    await screen.findByRole('button', { name: /beta/i });
    await user.click(screen.getByRole('button', { name: /beta/i }));
    expect(await screen.findByText('beta.pdf')).toBeVisible();
    await act(async () => alpha.resolve(filesResponse('alpha.pdf')));

    expect(screen.getByText('beta.pdf')).toBeVisible();
    expect(screen.queryByText('alpha.pdf')).not.toBeInTheDocument();
  });

  it('returns to the last valid page when the result set shrinks', async () => {
    let firstPageLoads = 0;
    request.mockImplementation(async (path: string) => {
      if (path === 'files/inventory/sources') return sourcesResponse('alpha');
      if (path.includes('/alpha/files?pageSize=25&cursor=before-shrink.pdf')) {
        return { data: [], meta: pageMeta(2) };
      }
      if (
        path.includes('/alpha/files?pageSize=25') &&
        !path.includes('cursor=')
      ) {
        firstPageLoads += 1;
        return firstPageLoads === 1
          ? filesResponse('before-shrink.pdf', 1, true)
          : filesResponse('after-shrink.pdf');
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    await renderPage();

    expect(await screen.findByText('before-shrink.pdf')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('after-shrink.pdf')).toBeVisible();
    expect(screen.getByText('Page 1')).toBeVisible();
    expect(firstPageLoads).toBe(2);
  });

  it('disables forward pagination after a page request fails', async () => {
    request.mockImplementation(async (path: string) => {
      if (path === 'files/inventory/sources') return sourcesResponse('alpha');
      if (path.includes('/alpha/files?pageSize=25&cursor=page-1.pdf')) {
        throw new Error('Second page failed');
      }
      if (
        path.includes('/alpha/files?pageSize=25') &&
        !path.includes('cursor=')
      ) {
        return filesResponse('page-1.pdf', 1, true);
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const user = userEvent.setup();
    await renderPage();

    expect(await screen.findByText('page-1.pdf')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Second page failed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(3);
  });
});

async function renderPage(locale: 'en-US' | 'zh-CN' = 'en-US'): Promise<void> {
  request.mockClear();
  const runtime = await createFileI18nRuntime(clientLocales, locale);
  render(
    <I18nProvider runtime={runtime}>
      <NamespaceScope ns={FILE_PLUGIN_NS}>
        <FileInventoryPage />
      </NamespaceScope>
    </I18nProvider>,
  );
}

function sourcesResponse(id: string): FileInventorySourcesResponse {
  return {
    data: [{ id, table: id }],
  };
}

function filesResponse(
  filename: string,
  page: number = 1,
  hasNextPage: boolean = false,
): FileInventoryFilesResponse {
  return {
    data: [
      {
        id: filename,
        disk: 'local',
        filename,
        mimeType: 'application/pdf',
        size: 42,
        public: false,
        createdAt: '2026-09-02T01:00:00.000Z',
        updatedAt: '2026-09-02T01:00:00.000Z',
      },
    ],
    meta: pageMeta(page, hasNextPage, filename),
  };
}

function pageMeta(
  _page: number,
  hasNextPage: boolean = false,
  nextCursor?: string,
): FileInventoryFilesResponse['meta'] {
  return {
    pageSize: 25,
    hasNextPage,
    ...(hasNextPage && nextCursor ? { nextCursor } : {}),
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
