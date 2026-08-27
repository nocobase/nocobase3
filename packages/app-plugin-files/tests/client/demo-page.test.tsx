import { readFile } from 'node:fs/promises';

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileRecord, FilesClient } from '../../client/types.js';

const mocks = vi.hoisted(() => ({
  createFilesClient: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  getHeaders: vi.fn(),
  resolvePortalUrl: vi.fn(),
}));

vi.mock('@nocobase/app-portal-sdk/client', () => ({
  nocobaseClient: {
    getHeaders: mocks.getHeaders,
  },
}));

vi.mock('@nocobase/app-portal-sdk/runtime', () => ({
  resolvePortalUrl: mocks.resolvePortalUrl,
}));

vi.mock('../../client/files-client.js', () => ({
  createFilesClient: mocks.createFilesClient,
}));

import FilesDemoPage from '../../client/default-pages/files-demo-page.js';

const examples = {
  profile: {
    id: 1,
    name: 'Demo Profile',
    filesEndpoint: '/api/attachments/profiles/1/avatar',
  },
  order: {
    id: 1,
    number: 'PO-DEMO-001',
    filesEndpoint: '/api/attachments/orders/1/files',
  },
};

function fileRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'file-1',
    filename: 'sample.png',
    mimeType: 'image/png',
    size: 2048,
    public: true,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    contentUrl: '/api/attachments/orders/1/files/file-1/content',
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockClient(overrides: Partial<FilesClient> = {}): FilesClient {
  return {
    list: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue(fileRecord()),
    get: vi.fn().mockResolvedValue(fileRecord()),
    createAccessUrl: vi.fn().mockResolvedValue({
      url: '/api/attachments/orders/1/files/file-1/content?token=signed',
      expiresAt: '2026-08-27T00:00:05.000Z',
    }),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let avatarClient: FilesClient;
let orderClient: FilesClient;

function configureClients({
  avatarFiles = [],
  orderFiles = [],
}: {
  avatarFiles?: readonly FileRecord[];
  orderFiles?: readonly FileRecord[];
} = {}): void {
  avatarClient = mockClient({
    list: vi.fn().mockResolvedValue(avatarFiles),
  });
  orderClient = mockClient({
    list: vi.fn().mockResolvedValue(orderFiles),
  });
  mocks.createFilesClient.mockImplementation(
    ({ endpoint }: { readonly endpoint: string }) => {
      if (endpoint === examples.profile.filesEndpoint) return avatarClient;
      if (endpoint === examples.order.filesEndpoint) return orderClient;
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    },
  );
}

async function renderReady(): Promise<void> {
  render(<FilesDemoPage />);
  expect(
    await screen.findByRole('heading', { name: 'Files demo' }),
  ).toBeVisible();
}

beforeEach(() => {
  mocks.createFilesClient.mockReset();
  mocks.fetch
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(jsonResponse({ data: examples })),
    );
  mocks.getHeaders.mockReset().mockReturnValue({
    Authorization: 'Bearer test-token',
  });
  mocks.resolvePortalUrl
    .mockReset()
    .mockReturnValue('http://localhost:3000/nocobase/api/attachments/examples');
  vi.stubGlobal('fetch', mocks.fetch);
  configureClients();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FilesDemoPage', () => {
  it('loads examples, constructs both clients, and renders empty states', async () => {
    render(<FilesDemoPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading file examples and attachments',
    );
    expect(
      await screen.findByRole('heading', { name: 'Files demo' }),
    ).toBeVisible();

    expect(mocks.resolvePortalUrl).toHaveBeenCalledWith(
      '/api/attachments/examples',
    );
    expect(mocks.getHeaders).toHaveBeenCalledWith({ method: 'GET' });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/nocobase/api/attachments/examples',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
        credentials: 'include',
      },
    );
    expect(mocks.createFilesClient).toHaveBeenNthCalledWith(1, {
      endpoint: examples.profile.filesEndpoint,
    });
    expect(mocks.createFilesClient).toHaveBeenNthCalledWith(2, {
      endpoint: examples.order.filesEndpoint,
    });
    expect(avatarClient.list).toHaveBeenCalledOnce();
    expect(orderClient.list).toHaveBeenCalledOnce();
    expect(
      screen.getByText('No Profile Avatar has been uploaded.'),
    ).toBeVisible();
    expect(
      screen.getByText('No Order Attachments have been uploaded.'),
    ).toBeVisible();
    expect(screen.getByText(/Demo Profile · ID 1/)).toBeVisible();
    expect(screen.getByText('PO-DEMO-001')).toBeVisible();
  });

  it('renders a clear unavailable state for a 503 response', async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'FILES_UNAVAILABLE',
            message: 'Storage is unavailable.',
          },
        },
        503,
      ),
    );

    render(<FilesDemoPage />);

    expect(
      await screen.findByRole('heading', { name: 'File demo is unavailable' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load file examples (503).',
    );
    expect(screen.getByText(/storage or database service/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('renders a permission error for an authenticated non-administrator', async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ error: { code: 'FORBIDDEN' } }, 403),
    );

    render(<FilesDemoPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Files Demo management requires system administrator access.',
    );
  });

  it('renders the Avatar and Order lists with accessible actions', async () => {
    const avatar = fileRecord({
      id: 'avatar-1',
      filename: 'avatar.png',
      public: false,
      contentUrl: '/api/attachments/profiles/1/avatar/avatar-1/content',
    });
    const publicOrder = fileRecord({
      id: 'public-1',
      filename: 'public.png',
    });
    configureClients({ avatarFiles: [avatar], orderFiles: [publicOrder] });

    await renderReady();

    expect(screen.getByLabelText('Upload profile avatar')).toBeVisible();
    expect(screen.getByLabelText('Upload order attachments')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Preview: avatar.png' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Download: public.png' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Remove: public.png' }),
    ).not.toHaveLength(0);
    expect(
      screen.getByText('1 of 10 files used for order PO-DEMO-001.'),
    ).toBeVisible();
  });

  it('uploads an Avatar and passes the selected Public option for Order files', async () => {
    const avatar = fileRecord({
      id: 'avatar-upload',
      filename: 'new-avatar.png',
      public: false,
    });
    const order = fileRecord({
      id: 'order-upload',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      public: true,
    });
    avatarClient.upload = vi.fn().mockResolvedValue(avatar);
    orderClient.upload = vi.fn().mockResolvedValue(order);

    await renderReady();

    const avatarFile = new File(['avatar'], 'new-avatar.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Upload profile avatar'), {
      target: { files: [avatarFile] },
    });
    await waitFor(() =>
      expect(avatarClient.upload).toHaveBeenCalledWith(avatarFile, {
        public: undefined,
      }),
    );
    expect(await screen.findAllByText('new-avatar.png')).not.toHaveLength(0);

    fireEvent.click(screen.getByLabelText('Public'));
    const orderFile = new File(['invoice'], 'invoice.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText('Upload order attachments'), {
      target: { files: [orderFile] },
    });
    await waitFor(() =>
      expect(orderClient.upload).toHaveBeenCalledWith(orderFile, {
        public: true,
      }),
    );
    expect(await screen.findAllByText('invoice.pdf')).not.toHaveLength(0);
  });

  it('requests a Private URL before preview and skips Token issuance for Public preview', async () => {
    const privateOrder = fileRecord({
      id: 'private-1',
      filename: 'private.png',
      public: false,
    });
    const publicOrder = fileRecord({
      id: 'public-1',
      filename: 'public.png',
      public: true,
    });
    configureClients({ orderFiles: [privateOrder, publicOrder] });

    await renderReady();

    fireEvent.click(
      screen.getByRole('button', { name: 'Preview: private.png' }),
    );
    await waitFor(() =>
      expect(orderClient.createAccessUrl).toHaveBeenCalledWith('private-1'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    vi.mocked(orderClient.createAccessUrl).mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview: public.png' }),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('img', {
        name: 'public.png',
      }),
    ).toHaveAttribute('src', publicOrder.contentUrl);
    expect(orderClient.createAccessUrl).not.toHaveBeenCalled();
  });

  it('refetches the Order list after delete', async () => {
    const order = fileRecord({ id: 'delete-1', filename: 'delete-me.png' });
    orderClient.list = vi
      .fn<FilesClient['list']>()
      .mockResolvedValueOnce([order])
      .mockResolvedValueOnce([]);

    await renderReady();

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remove: delete-me.png',
    });
    fireEvent.click(removeButtons.at(-1) as HTMLButtonElement);

    await waitFor(() =>
      expect(orderClient.remove).toHaveBeenCalledWith('delete-1'),
    );
    await waitFor(() => expect(orderClient.list).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText('No Order Attachments have been uploaded.'),
    ).toBeVisible();
  });

  it('displays max-file and upload errors', async () => {
    const tenFiles = Array.from({ length: 10 }, (_, index) =>
      fileRecord({
        id: `limit-${index}`,
        filename: `limit-${index}.png`,
      }),
    );
    configureClients({ orderFiles: tenFiles });

    const firstRender = render(<FilesDemoPage />);
    await screen.findByRole('heading', { name: 'Files demo' });

    fireEvent.change(screen.getByLabelText('Upload order attachments'), {
      target: { files: [new File(['x'], 'extra.png', { type: 'image/png' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The maximum number of files has been reached.',
    );
    firstRender.unmount();

    configureClients();
    orderClient.upload = vi
      .fn()
      .mockRejectedValue(new Error('Upload rejected.'));
    render(<FilesDemoPage />);
    await screen.findAllByRole('heading', { name: 'Files demo' });
    const uploadInputs = screen.getAllByLabelText('Upload order attachments');
    fireEvent.change(uploadInputs.at(-1) as HTMLInputElement, {
      target: { files: [new File(['x'], 'failed.png', { type: 'image/png' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Upload rejected.',
    );
  });

  it('opens Public content directly and surfaces an expired Private URL without showing its Token', async () => {
    const publicOrder = fileRecord({
      id: 'public-1',
      filename: 'public.png',
      public: true,
    });
    const privateOrder = fileRecord({
      id: 'private-1',
      filename: 'private.png',
      public: false,
    });
    configureClients({ orderFiles: [publicOrder, privateOrder] });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({ data: examples }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Access URL has expired.' }), {
          status: 401,
        }),
      );

    await renderReady();

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Public file: public.png' }),
    );
    expect(open).toHaveBeenCalledWith(
      publicOrder.contentUrl,
      '_blank',
      'noopener,noreferrer',
    );
    expect(orderClient.createAccessUrl).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Short-lived URL TTL in seconds'), {
      target: { value: '2' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Request short-lived URL: private.png',
      }),
    );
    await waitFor(() =>
      expect(orderClient.createAccessUrl).toHaveBeenCalledWith('private-1', 2),
    );
    expect(screen.getByText(/Expires at/)).toBeVisible();
    expect(document.body).not.toHaveTextContent('token=signed');

    fireEvent.click(screen.getByRole('button', { name: 'Check access URL' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Access URL has expired.',
    );
    expect(document.body).not.toHaveTextContent('token=signed');
  });

  it('contains no remote sample URL or legacy storage action', async () => {
    const source = await readFile(
      'client/default-pages/files-demo-page.tsx',
      'utf8',
    );
    const legacyPrefix = ['storage', 's:'].join('');

    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toContain(legacyPrefix);
    expect(source).toContain("'/api/attachments/examples'");
  });
});
