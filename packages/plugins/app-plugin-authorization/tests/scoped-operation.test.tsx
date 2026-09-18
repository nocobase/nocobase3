// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ScopedOperation } from '../client/pages/permission-sets/scoped-operation.js';
import type { GrantDraft } from '../client/pages/permission-sets/types.js';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
function Harness({ defaults = false }: { defaults?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [grant, setGrant] = useState<GrantDraft>({
    id: 1,
    resource: { type: 'resource', id: 'quotes' },
    actions: ['submit'],
    policies: {
      submit: {
        type: 'resource',
        quotes: {
          key: 'customFilter',
          params: { filter: { kind: 'group', logic: 'and', items: [] } },
        },
      },
    },
  });
  return (
    <div ref={containerRef}>
      <ScopedOperation
        container={containerRef}
        item={{ value: 'quotes', label: 'Quotes' }}
        action={{ value: 'submit', label: 'Submit' }}
        config={{
          policyType: 'resource',
          fields: ['projects', 'quotes'].map((key) => ({
            key,
            label: key,
            defaultValue: defaults ? 'recordsIOwn' : '',
            options: [
              { value: '', label: 'Defaults' },
              { value: 'allRecords', label: 'All records' },
              { value: 'recordsIOwn', label: 'Own records' },
              { value: 'customFilter', label: 'Custom filter' },
            ],
          })),
        }}
        grant={grant}
        disabled={false}
        onToggle={() => {}}
        onChange={setGrant}
      />
      <output data-testid='grant'>{JSON.stringify(grant)}</output>
    </div>
  );
}
it('toggles each scope independently, preserves sibling configuration and retains the operation grant', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Quotes: Submit' }));
  expect(
    screen.getByRole('checkbox', { name: 'Specify scope: projects' }),
  ).not.toBeChecked();
  expect(
    screen.queryByRole('combobox', { name: 'projects' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'Specify scope: quotes' }),
  ).toBeChecked();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Specify scope: projects' }),
  );
  expect(
    screen.getByRole('combobox', { name: 'projects' }),
  ).toBeInTheDocument();
  const enabled = JSON.parse(
    screen.getByTestId('grant').textContent!,
  ) as GrantDraft;
  expect(enabled.policies?.submit).toMatchObject({
    projects: 'recordsIOwn',
    quotes: { key: 'customFilter' },
  });
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Specify scope: projects' }),
  );
  const disabled = JSON.parse(
    screen.getByTestId('grant').textContent!,
  ) as GrantDraft;
  expect(disabled.actions).toEqual(['submit']);
  expect(disabled.policies?.submit).toMatchObject({
    projects: '',
    quotes: { key: 'customFilter' },
  });
  expect(
    screen.queryByRole('combobox', { name: 'projects' }),
  ).not.toBeInTheDocument();
});
it('explicitly disables a registered default instead of silently restoring it on save', () => {
  render(<Harness defaults />);
  fireEvent.click(screen.getByRole('button', { name: 'Quotes: Submit' }));
  expect(
    screen.getByRole('checkbox', { name: 'Specify scope: projects' }),
  ).toBeChecked();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Specify scope: projects' }),
  );
  expect(
    JSON.parse(screen.getByTestId('grant').textContent!).policies.submit
      .projects,
  ).toBe('');
});
