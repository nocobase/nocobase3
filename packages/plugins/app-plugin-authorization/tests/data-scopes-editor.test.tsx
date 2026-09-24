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
  DataScopesEditor,
  type DataScopeRuleAction,
} from '../client/components/data-scopes-editor.js';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import { subsection, withSubsections } from './workspace-options.js';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
const options: AuthorizationOptions = {
  sections: withSubsections({
    business: [
      subsection('business.other', 'Other', [
        {
          type: 'business',
          value: 'sales',
          label: 'Sales',
          actions: [{ value: 'submit', label: 'Submit' }],
          dataScopes: {
            submit: ['projects', 'quotes'].map((key) => ({
              key,
              label: key === 'projects' ? 'Projects' : 'Quotes',
              collection: key,
              collectionFields: [],
              defaultValue: '',
              options: [{ value: '', label: 'Defaults' }],
            })),
          },
        },
      ]),
    ],
  }),
  subjectTypes: [],
  recordAccess: [],
  collections: [
    { name: 'projects', fields: ['id', 'title'] },
    { name: 'quotes', fields: ['id', 'amount'] },
  ],
};
it('uses the declared table for each record picker and preserves its sibling scope when edited', async () => {
  const load = vi.fn(async (collection: string) => [
    { id: `${collection}-1`, label: `${collection} record` },
  ]);
  function Harness() {
    const [value, setValue] = useState<readonly DataScopeRuleAction[]>([
      {
        action: 'submit',
        scopeKey: 'projects',
        selection: { type: 'records', ids: [] },
      },
      {
        action: 'submit',
        scopeKey: 'quotes',
        selection: { type: 'records', ids: ['quotes-1'] },
      },
    ]);
    return (
      <>
        <DataScopesEditor
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
      selection: { type: 'records', ids: ['quotes-1'] },
    },
  ]);
});
