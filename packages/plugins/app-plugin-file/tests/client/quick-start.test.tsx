import { createApiClient } from '@nocobase/app-client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OrderAttachments from '../../skills/nocobase-app-plugin-file/reference/example/client/order-attachments.js';

const { useService } = vi.hoisted(() => ({ useService: vi.fn() }));
vi.mock('@nocobase/app-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nocobase/app-client')>()),
  useService,
}));

afterEach(() => vi.clearAllMocks());

function record(filename: string) {
  return {
    id: filename,
    filename,
    mimeType: 'application/pdf',
    size: 1,
    public: false,
    createdAt: '',
    updatedAt: '',
    contentUrl: `/api/files/${filename}/content`,
  };
}

function response(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { 'content-type': 'application/json' },
  });
}

function setup(fetch: typeof globalThis.fetch): void {
  useService.mockReturnValue(createApiClient({ baseURL: '/base/api', fetch }));
}

describe('bundled attachment form example', () => {
  it('does not request files before the parent is saved', () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    setup(fetch);
    render(<OrderAttachments onDone={vi.fn()} />);
    expect(
      screen.getByText('Save the order before adding attachments.'),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Done' }),
    ).not.toBeInTheDocument();
  });

  it('blocks editing on load failure and retries', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response([record('saved.pdf')]));
    setup(fetch);
    render(<OrderAttachments orderId='order-a' onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry loading' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled(),
    );
    expect(
      screen.getByRole('button', { name: 'Remove: saved.pdf' }),
    ).toBeVisible();
    expect(fetch.mock.calls[1]?.[0]).toBe(
      '/base/api/purchase-orders/order-a/attachments',
    );
  });

  it('ignores a late list response from the previous owner', async () => {
    let finishOld!: (value: Response) => void;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(response([record('order-b.pdf')]));
    setup(fetch);
    const { rerender } = render(
      <OrderAttachments orderId='order-a' onDone={vi.fn()} />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    rerender(<OrderAttachments orderId='order-b' onDone={vi.fn()} />);
    await screen.findByRole('button', { name: 'Remove: order-b.pdf' });
    await act(async () => {
      finishOld(response([record('order-a.pdf')]));
    });
    expect(
      screen.queryByRole('button', { name: 'Remove: order-a.pdf' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove: order-b.pdf' }),
    ).toBeVisible();
  });

  it('blocks Done until an upload succeeds', async () => {
    let failUpload!: (error: Error) => void;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response([]))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failUpload = reject;
          }),
      )
      .mockResolvedValueOnce(response(record('new.pdf')));
    setup(fetch);
    const done = vi.fn();
    render(<OrderAttachments orderId='order-a' onDone={done} />);
    const button = screen.getByRole('button', { name: 'Done' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: {
        files: [new File(['x'], 'new.pdf', { type: 'application/pdf' })],
      },
    });
    await waitFor(() => expect(button).toBeDisabled());
    await act(async () => {
      failUpload(new Error('Upload failed'));
    });
    expect(button).toBeDisabled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry: new.pdf' }),
    );
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(done).toHaveBeenCalledOnce();
  });
});
