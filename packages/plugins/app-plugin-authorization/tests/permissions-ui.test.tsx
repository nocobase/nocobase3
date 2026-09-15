// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import type { AuthorizationOptions } from '../client/authorization-client.js';
import { TablePager } from '../client/components/management-ui.js';
import { pageRangeLabel, pageSlice } from '../client/components/pagination.js';
// The database resource type contributes how its grants read; without it the
// table still renders, which is what the invented-type test covers.
import '../client/pages/permission-sets/database-presentation.js';
import { PermissionsSummary } from '../client/pages/permission-sets/permissions-tab.js';
import type { Draft } from '../client/pages/permission-sets/types.js';
import { translate } from './locale-harness.js';

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
    { value: 'customFilter', label: 'Custom Filter' },
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

/** One resource configured the way the detail panel has to read it back. */
const detailDraft: Draft = {
  key: 'order-ops',
  title: 'Order operators',
  grants: [
    {
      id: 1,
      resource: { type: 'database.collection', id: 'orders' },
      actions: ['read', 'update'],
      database: {
        read: {
          input: '*',
          output: ['id', 'status'],
          recordAccess: 'recordsIOwn',
        },
        update: {
          input: ['status'],
          output: ['status'],
          recordAccess: {
            key: 'customFilter',
            params: { filter: { $and: [{ status: { $eq: 'open' } }] } },
          },
        },
      },
    },
  ],
};

/** A resource type this module knows nothing about, declaring its own action. */
const inventedOptions: AuthorizationOptions = {
  ...options,
  resourceTypes: [
    {
      value: 'scheduler.job',
      label: 'Jobs',
      resources: [{ value: 'nightly-export', label: 'Nightly export' }],
      actions: [{ value: 'run', label: 'Run' }],
    },
  ],
};

const inventedDraft: Draft = {
  key: 'operators',
  title: 'Operators',
  grants: [
    {
      id: 1,
      resource: { type: 'scheduler.job', id: 'nightly-export' },
      actions: ['run'],
      database: {},
    },
  ],
};

function headers(): readonly (string | null)[] {
  return screen.getAllByRole('columnheader').map((cell) => cell.textContent);
}

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
    expect(pageRangeLabel(translate, 23, 1, 10)).toBe(
      translate('pagination.range', { first: 1, last: 10, total: 23 }),
    );
    expect(pageRangeLabel(translate, 23, 3, 10)).toBe(
      translate('pagination.range', { first: 21, last: 23, total: 23 }),
    );
    expect(pageRangeLabel(translate, 0, 1, 10)).toBe(
      translate('pagination.empty'),
    );
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
    expect(
      screen.getByText(
        translate('pagination.range', { first: 1, last: 10, total: 23 }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: translate('pagination.previous') }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: translate('pagination.next') }),
    );
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
  it('opens on one table naming the resource, its type beneath it and each granted action', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    // The type is a second line under the name rather than a column of its own.
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual([
      translate('common.resource'),
      translate('permissionSets.permissions.grantedActions'),
      translate('permissionSets.permissions.recordsAndFields'),
    ]);

    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    const orders = within(rows[0] as HTMLElement);
    expect(orders.getByText('Orders')).toBeInTheDocument();
    expect(orders.getByText('Collections')).toBeInTheDocument();

    // The granted actions alone, each mark beside the name of its action.
    expect(
      orders.getAllByRole('img').map((mark) => mark.getAttribute('aria-label')),
    ).toEqual([
      translate('marks.labels.all'),
      translate('marks.labels.scoped'),
    ]);
    expect(orders.getByText('Read')).toBeInTheDocument();
    expect(orders.getByText('Update')).toBeInTheDocument();

    const articles = within(rows[1] as HTMLElement);
    expect(
      articles
        .getAllByRole('img')
        .map((mark) => mark.getAttribute('aria-label')),
    ).toEqual([translate('marks.labels.all')]);
    expect(articles.getByText('Read')).toBeInTheDocument();
    expect(articles.queryByText('Update')).toBeNull();
    expect(
      within(rows[2] as HTMLElement).getByText('Pages'),
    ).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByText('View'),
    ).toBeInTheDocument();
  });

  it('summarises records and fields with the policy label, not the stored key', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    const rows = bodyRows();
    // Two actions disagreeing on their records say so once; one action names its policy.
    expect(
      within(rows[0] as HTMLElement).getByText(
        translate('labels.recordsAndFields', {
          records: translate('labels.mixedRecords'),
          fields: translate('labels.allFieldsLower'),
        }),
      ),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText(
        translate('labels.recordsAndFields', {
          // The policy label comes from the options endpoint, so it stays as the server named it.
          records: 'All Records',
          fields: translate('labels.allFieldsLower'),
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/RecordsIOwn/)).toBeNull();
  });

  it('carries no edit control in the filter bar', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    expect(
      screen.queryByRole('button', { name: 'Edit permissions' }),
    ).toBeNull();
  });

  it('keeps the same columns whichever type chip is selected', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    const combined = headers();

    for (const chip of ['Collections', 'Pages']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(chip) }));
      // A type chip filters the rows; it never changes what the columns are.
      expect(headers()).toEqual(combined);
    }
    expect(combined).toEqual([
      translate('common.resource'),
      translate('permissionSets.permissions.grantedActions'),
      translate('permissionSets.permissions.recordsAndFields'),
    ]);
  });

  it('reports one resource action by action, with its records and its fields', () => {
    render(<PermissionsSummary draft={detailDraft} options={options} />);
    fireEvent.click(screen.getByText('Orders'));
    const panel = within(screen.getByRole('dialog'));

    // Every action the type declares is reported, granted or not.
    expect(
      panel.getAllByText(translate('permissionSets.permissions.allowed')),
    ).toHaveLength(2);
    expect(
      panel.getAllByText(translate('permissionSets.permissions.notGranted')),
    ).toHaveLength(2);

    expect(panel.getByText('Records I Own')).toBeInTheDocument();
    expect(panel.getByText('Custom Filter')).toBeInTheDocument();
    expect(
      panel.getByText(`status ${translate('filterOperators.$eq')} open`),
    ).toBeInTheDocument();

    // The fields are named rather than counted.
    expect(panel.getAllByText('id')).toHaveLength(1);
    expect(panel.getAllByText('status')).toHaveLength(3);
    expect(
      panel.getByText(translate('databasePolicy.writableFields')),
    ).toBeInTheDocument();
    expect(
      panel.getAllByText(translate('databasePolicy.visibleFields')),
    ).toHaveLength(2);
  });

  it('leaves only the rows of the type its chip names', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: /Pages/ }));
    const rows = bodyRows();
    expect(rows).toHaveLength(1);
    const home = within(rows[0] as HTMLElement);
    expect(home.getByText('Home')).toBeInTheDocument();
    expect(home.getByText('View')).toBeInTheDocument();
    // A page adds nothing to summarise, so its last cell stays empty.
    expect(home.getAllByRole('cell').at(-1)).toBeEmptyDOMElement();
  });

  it('renders a resource type it has never heard of', () => {
    render(
      <PermissionsSummary draft={inventedDraft} options={inventedOptions} />,
    );
    expect(headers()).toEqual([
      translate('common.resource'),
      translate('permissionSets.permissions.grantedActions'),
      translate('permissionSets.permissions.recordsAndFields'),
    ]);

    const row = within(bodyRows()[0] as HTMLElement);
    expect(row.getByText('Nightly export')).toBeInTheDocument();
    expect(row.getByText('Jobs')).toBeInTheDocument();
    // Its own actions, each reaching the whole resource, and nothing to summarise.
    expect(
      row.getAllByRole('img').map((mark) => mark.getAttribute('aria-label')),
    ).toEqual([translate('marks.labels.all')]);
    expect(row.getByText('Run')).toBeInTheDocument();
    expect(row.getAllByRole('cell').at(-1)).toBeEmptyDOMElement();
  });

  it('returns every filter in the bar to its default', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: /Pages/ }));
    fireEvent.change(screen.getByLabelText('Search resources'), {
      target: { value: 'nothing' },
    });
    expect(bodyRows()).toHaveLength(1);
    expect(
      screen.getByText(translate('permissionSets.permissions.emptyFiltered')),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: translate('filters.clear') }),
    );
    expect(screen.getByLabelText('Search resources')).toHaveValue('');
    expect(bodyRows()).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: translate('filters.clear') }),
    ).toBeNull();
  });

  it('clears the search field from the field itself', () => {
    render(<PermissionsSummary draft={draft} options={options} />);
    const field = screen.getByLabelText('Search resources');
    fireEvent.change(field, { target: { value: 'articles' } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: translate('filters.clearSearch', {
          label: translate(
            'permissionSets.permissions.searchResources',
          ).toLowerCase(),
        }),
      }),
    );
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(bodyRows()).toHaveLength(3);
  });
});
