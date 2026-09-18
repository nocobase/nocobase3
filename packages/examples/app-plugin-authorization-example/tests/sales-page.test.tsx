// @vitest-environment jsdom
import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    data:
      path === 'sales/projects'
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
});

it('shows quote relationships and preparers without rendering other resource tables', () => {
  render(
    <MemoryRouter>
      <SalesPage path='quotes' />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('table')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'p1' })).toHaveAttribute(
    'href',
    '/authorization-example/projects?record=p1',
  );
  expect(screen.getByText('sales.preparedBy: Alex Chen')).toBeInTheDocument();
  expect(screen.queryByText('Harbor order')).not.toBeInTheDocument();
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

it('filters linked lists and lets users return to all permitted records', () => {
  render(
    <MemoryRouter
      initialEntries={['/authorization-example/quotes?project=other']}
    >
      <SalesPage path='quotes' />
    </MemoryRouter>,
  );
  expect(screen.getByText('sales.empty')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'sales.clearFilter' }));
  expect(screen.getByText('Harbor quote')).toBeInTheDocument();
});

it.each([
  [400, 'sales.errors.input'],
  [403, 'forbidden'],
  [409, 'sales.errors.conflict'],
  [undefined, 'sales.errors.request'],
])('distinguishes request errors with status %s', async (status, message) => {
  api.request.mockRejectedValueOnce({ status });
  render(
    <MemoryRouter>
      <SalesPage path='projects' />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'sales.save' }));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(message!),
  );
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
