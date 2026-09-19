import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@nocobase/app-client';
import type { Customer } from '../server/types.js';
import en from '../client/locales/en-US.js';

const state = vi.hoisted(() => ({
  api: undefined as ReturnType<typeof createApiClient> | undefined,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => state.api,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: translate }),
}));
function translate(key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (current, part) => (current as Record<string, unknown>)[part],
      en,
    );
  return typeof value === 'string' ? value : key;
}
import CustomersPage from '../client/pages/customers.js';

// DOM behavior uses the real API client; backend integration is exercised separately in Node.
let rows: Customer[];
let mutations: number;
let historyFails: boolean;
beforeAll(() => {
  if (!window.matchMedia)
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
});
afterEach(cleanup);
function mount() {
  rows = [];
  mutations = 0;
  historyFails = false;
  state.api = createApiClient({
    baseURL: 'http://localhost/api',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      if (path.endsWith('/operations'))
        return historyFails
          ? Response.json({ code: 'UNAVAILABLE' }, { status: 503 })
          : Response.json({ data: [] });
      if (method === 'GET') return Response.json({ data: rows });
      mutations++;
      const body = JSON.parse(String(init?.body)) as Customer;
      if (method === 'POST')
        rows.push({ ...body, id: 'c1', ownerId: 'alice', version: 1 });
      if (method === 'PATCH')
        rows = [{ ...body, ownerId: 'alice', version: body.version + 1 }];
      if (method === 'DELETE') rows = [];
      return Response.json({ data: rows[0] ?? { deleted: true } });
    },
  });
  return render(<CustomersPage />);
}

describe('customer history page', () => {
  it('creates, edits, cancels without a write, and deletes through the host API', async () => {
    mount();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Customer name'), 'Ada');
    await user.type(screen.getByLabelText('Phone number'), '13800001234');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));
    const row = await screen.findByRole('row', { name: /Ada/ });
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Phone number'));
    await user.type(screen.getByLabelText('Phone number'), '13900005678');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mutations).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Phone number'));
    await user.type(screen.getByLabelText('Phone number'), '13900005678');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('cell', { name: '13900005678' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByText('Customer deleted. History is retained.');
    expect(mutations).toBe(3);
  });
  it('keeps saved status and does not repeat the write when history refresh fails', async () => {
    mount();
    historyFails = true;
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Customer name'), 'Saved');
    await user.type(screen.getByLabelText('Phone number'), '13800001234');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));
    await screen.findByText('Customer saved.');
    await screen.findByText(
      'Could not load history. Do not repeat the customer operation.',
    );
    await waitFor(() => expect(mutations).toBe(1));
  });
});
