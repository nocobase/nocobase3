// @vitest-environment jsdom
import { useState } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  BusinessRuleScopes,
  type BusinessRuleScope,
} from '../client/components/business-rule-scopes.js';
import type { AuthorizationOptions } from '../client/authorization-client.js';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
const options: AuthorizationOptions = {
  plugins: [],
  subjectTypes: [],
  recordAccessPolicies: [],
  collections: [
    { name: 'projects', fields: ['id', 'title'] },
    { name: 'quotes', fields: ['id', 'amount'] },
  ],
  resourceTypes: [
    {
      value: 'resource',
      label: 'Features',
      actions: [],
      resources: [
        {
          value: 'sales',
          label: 'Sales',
          actions: [{ value: 'submit', label: 'Submit' }],
          ruleScopes: [
            {
              action: 'submit',
              scopeKey: 'projects',
              label: 'Projects',
              collection: 'projects',
            },
            {
              action: 'submit',
              scopeKey: 'quotes',
              label: 'Quotes',
              collection: 'quotes',
            },
          ],
        },
      ],
    },
  ],
};
it('uses the declared table for each record picker and preserves its sibling scope when edited', async () => {
  const load = vi.fn(async (collection: string) => [
    { id: `${collection}-1`, label: `${collection} record` },
  ]);
  function Harness() {
    const [value, setValue] = useState<readonly BusinessRuleScope[]>([
      {
        action: 'submit',
        scopeKey: 'projects',
        scope: { type: 'ids', ids: [] },
      },
      {
        action: 'submit',
        scopeKey: 'quotes',
        scope: { type: 'ids', ids: ['quotes-1'] },
      },
    ]);
    return (
      <>
        <BusinessRuleScopes
          options={options}
          resourceId='sales'
          value={value}
          onChange={setValue}
          loadRecords={load}
        />
        <output data-testid='value'>{JSON.stringify(value)}</output>
      </>
    );
  }
  render(<Harness />);
  expect(screen.getAllByRole('heading', { name: 'Submit' })).toHaveLength(1);
  expect(screen.getAllByRole('combobox')).toHaveLength(2);
  expect(screen.queryByText('Record access policy')).not.toBeInTheDocument();
  await waitFor(() => expect(load).toHaveBeenCalledWith('projects'));
  expect(load).toHaveBeenCalledWith('quotes');
  const projectSection = screen
    .getByRole('checkbox', { name: 'Projects' })
    .closest('section')!;
  await within(projectSection).findByText('projects record');
  expect(within(projectSection).queryByText('quotes record')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Projects' }));
  expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual([
    {
      action: 'submit',
      scopeKey: 'quotes',
      scope: { type: 'ids', ids: ['quotes-1'] },
    },
  ]);
});
