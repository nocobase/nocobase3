// @vitest-environment jsdom
import { MemoryRouter } from 'react-router';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ request: vi.fn(async () => ({ data: {} })) }));
vi.mock('@nocobase/app-client', () => ({
  apiClientToken: {},
  useService: () => api,
}));
vi.mock('../client/pages/use-example.js', () => ({
  useExample: (path: string) => ({
    loading: false,
    error: '',
    reload: vi.fn(),
    data: path.endsWith('/relations')
      ? {
          id: 'o1',
          title: 'Harbor order',
          access: 'allowed',
          operations: {
            deliveryTeam: ['connect', 'disconnect'],
            checks: ['create', 'update', 'delete'],
            collaborators: ['connect', 'set', 'disconnect'],
          },
          options: {
            deliveryTeam: [{ id: 'delivery', title: 'Delivery' }],
            collaborators: [{ id: 'proposal', title: 'Proposal' }],
          },
          deliveryTeam: null,
          checks: [],
          collaborators: [],
        }
      : path === 'sales/projects'
        ? {
            items: [
              {
                id: 'p1',
                title: 'Harbor',
                notes: 'Qualified',
                operations: { edit: 'allowed' },
              },
            ],
          }
        : path === 'sales/quotes'
          ? {
              items: [
                {
                  id: 'q1',
                  title: 'Harbor quote',
                  projectId: 'p1',
                  preparedByName: 'Alex Chen',
                  operations: { edit: 'allowed', submit: 'allowed' },
                  notes: 'Draft',
                  amount: 100,
                  status: 'draft',
                },
              ],
              navigation: { projects: true, quotes: true, orders: true },
            }
          : {
              items: [
                {
                  id: 'o1',
                  title: 'Harbor order',
                  projectId: 'p1',
                  quoteId: 'q1',
                  status: 'ready',
                  deliveryReference: '',
                  operations: { deliver: 'allowed' },
                },
              ],
              navigation: { projects: false, quotes: false, orders: true },
            },
  }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
import SalesPage from '../client/pages/sales-page.js';
it('submits pricing, quotes and delivery to their distinct endpoints', async () => {
  const page = render(
    <MemoryRouter>
      <SalesPage path='quotes' />
    </MemoryRouter>,
  );
  fireEvent.change(
    screen.getByRole('spinbutton', { name: 'Harbor quote: sales.amount' }),
    { target: { value: '250' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'sales.save' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/authorization-example/sales/quotes/q1',
      json: { amount: 250, notes: 'Draft' },
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'sales.submit' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'sales.submit' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/authorization-example/sales/quotes/q1/submit',
      json: {},
    }),
  );
  page.unmount();
  render(
    <MemoryRouter>
      <SalesPage path='orders' />
    </MemoryRouter>,
  );
  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'Harbor order: sales.deliveryReference',
    }),
    { target: { value: 'SHIP-42' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'sales.deliver' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/authorization-example/sales/orders/o1/deliver',
      json: { deliveryReference: 'SHIP-42' },
    }),
  );
  cleanup();
  // The order relationship editor sends relation mutation envelopes.
  render(
    <MemoryRouter>
      <SalesPage path='orders' />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'relations.assign' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/authorization-example/sales/orders/o1/relations',
      json: { deliveryTeam: { connect: { id: 'delivery' } } },
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'relations.addProposal' }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'relations.note' }), {
    target: { value: 'Review paperwork' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'relations.addProposal' }),
  );
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/authorization-example/sales/orders/o1/relations',
      json: {
        collaborators: {
          connect: [
            {
              where: { id: 'proposal' },
              through: { note: 'Review paperwork' },
            },
          ],
        },
      },
    }),
  );
});

it('keeps delivery references visible without linking to unauthorized menus', () => {
  render(
    <MemoryRouter>
      <SalesPage path='orders' />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('p1 · sales.noPageAccess')).toBeInTheDocument();
  expect(screen.getByText('q1 · sales.noPageAccess')).toBeInTheDocument();
});

it('requires unsaved quote changes to be saved before submission', () => {
  render(
    <MemoryRouter>
      <SalesPage path='quotes' />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole('spinbutton'), {
    target: { value: '999' },
  });
  expect(screen.getByRole('button', { name: 'sales.submit' })).toBeDisabled();
  expect(screen.getByText('sales.saveFirst')).toBeInTheDocument();
});
