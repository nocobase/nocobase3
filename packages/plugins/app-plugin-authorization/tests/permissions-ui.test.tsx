// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuthorizationOptions } from '../client/authorization-client.js';
import { TablePager } from '../client/components/management-ui.js';
import { pageRangeLabel, pageSlice } from '../client/components/pagination.js';
import { PermissionsSummary } from '../client/pages/permission-sets/permissions-tab.js';
import type { Draft } from '../client/pages/permission-sets/types.js';

const options: AuthorizationOptions = {
  plugins: [],
  resourceTypes: [
    {
      value: 'database.collection',
      label: 'Collections',
      resources: [
        { value: 'orders', label: 'Orders' },
        { value: 'articles', label: 'Articles' },
      ],
      actions: [
        { value: 'read', label: 'Read' },
        { value: 'create', label: 'Create' },
        { value: 'update', label: 'Update' },
        { value: 'delete', label: 'Delete' },
      ],
    },
    {
      value: 'page',
      label: 'Pages',
      resources: [{ value: 'home', label: 'Home' }],
      actions: [{ value: 'view', label: 'View' }],
    },
  ],
  subjectTypes: [],
  collections: [
    { name: 'orders', fields: ['id', 'status'] },
    { name: 'articles', fields: ['id'] },
  ],
  recordAccessPolicies: [
    { value: 'allRecords', label: 'All Records' },
    { value: 'recordsIOwn', label: 'Records I Own' },
  ],
};

const draft: Draft = {
  key: 'order-ops',
  title: 'Order operators',
  grants: [
    {
      id: 1,
      resource: { type: 'database.collection', id: 'orders' },
      actions: ['read', 'update'],
      database: {
        read: { input: '*', output: '*', recordAccess: 'allRecords' },
        update: { input: '*', output: '*', recordAccess: 'recordsIOwn' },
      },
    },
    {
      id: 2,
      resource: { type: 'database.collection', id: 'articles' },
      actions: ['read'],
      database: {
        read: { input: '*', output: '*', recordAccess: 'allRecords' },
      },
    },
    {
      id: 3,
      resource: { type: 'page', id: 'home' },
      actions: ['view'],
      database: {},
    },
  ],
};

function bodyRows(): readonly HTMLElement[] {
  const [body] = screen.getAllByRole('rowgroup').slice(1);
  return within(body as HTMLElement).getAllByRole('row');
}

describe('pagination helpers', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);

  it('slices a page out of the rows the panel already holds', () => {
    expect(pageSlice(rows, 1, 10)).toEqual(rows.slice(0, 10));
    expect(pageSlice(rows, 3, 10)).toEqual(rows.slice(20));
  });

  it('clamps a page left beyond the end of a narrowed list', () => {
    expect(pageSlice(rows.slice(0, 4), 3, 10)).toEqual(rows.slice(0, 4));
  });

  it('reports the range and the total', () => {
    expect(pageRangeLabel(23, 1, 10)).toBe('1–10 of 23');
    expect(pageRangeLabel(23, 3, 10)).toBe('21–23 of 23');
    expect(pageRangeLabel(0, 1, 10)).toBe('0 of 0');
  });
});

describe('table pager', () => {
  it('states the range and disables the edges of the list', () => {
    const seen: number[] = [];
    render(
      <TablePager
        label='Rules'
        page={1}
        total={23}
        onPage={(page) => seen.push(page)}
      />,
    );
    expect(screen.getByText('1–10 of 23')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(seen).toEqual([2]);
  });

  it('shows nothing when there is nothing to page', () => {
    const { container } = render(
      <TablePager label='Rules' page={1} total={0} onPage={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('permissions tab', () => {
  it('renders one row per resource with the record scope per action', () => {
    render(
      <PermissionsSummary
        draft={draft}
        options={options}
        onEdit={() => undefined}
      />,
    );
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    const orders = within(rows[0] as HTMLElement);
    expect(orders.getByText('Orders')).toBeInTheDocument();
    expect(orders.getAllByLabelText('Every record')).toHaveLength(1);
    expect(orders.getAllByLabelText('Scoped records')).toHaveLength(1);
    expect(orders.getAllByLabelText('Not granted')).toHaveLength(2);
  });

  it('switches tables with the resource type chips', () => {
    render(
      <PermissionsSummary
        draft={draft}
        options={options}
        onEdit={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pages/ }));
    const rows = bodyRows();
    expect(rows).toHaveLength(1);
    expect(
      within(rows[0] as HTMLElement).getByText('Home'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'View' }),
    ).toBeInTheDocument();
  });

  it('returns every filter in the bar to its default', () => {
    render(
      <PermissionsSummary
        draft={draft}
        options={options}
        onEdit={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pages/ }));
    fireEvent.change(screen.getByLabelText('Search resources'), {
      target: { value: 'nothing' },
    });
    expect(bodyRows()).toHaveLength(1);
    expect(
      screen.getByText('No permissions match these filters.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByLabelText('Search resources')).toHaveValue('');
    expect(bodyRows()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull();
  });

  it('clears the search field from the field itself', () => {
    render(
      <PermissionsSummary
        draft={draft}
        options={options}
        onEdit={() => undefined}
      />,
    );
    const field = screen.getByLabelText('Search resources');
    fireEvent.change(field, { target: { value: 'articles' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear search resources' }),
    );
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(bodyRows()).toHaveLength(2);
  });
});
