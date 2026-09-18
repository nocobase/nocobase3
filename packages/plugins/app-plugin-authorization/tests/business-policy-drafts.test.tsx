// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { fromSet, toInput } from '../client/pages/permission-sets/drafts.js';
import { ScopedOperation } from '../client/pages/permission-sets/scoped-operation.js';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
const original = {
  key: 'dispatcher',
  title: 'Dispatcher',
  grants: [
    {
      resource: { type: 'work', id: 'tasks' },
      actions: [
        {
          action: 'assign',
          policy: {
            type: 'assignment',
            tasks: 'own',
            people: 'department',
            futureConstraint: { keep: true },
          },
        },
      ],
    },
  ],
};
it('preserves unknown policy keys when saving other permission-set details', () => {
  const draft = fromSet(original);
  draft.title = 'Changed';
  expect(toInput(draft).grants).toEqual(original.grants);
});
function Harness() {
  const [draft, setDraft] = useState(() => fromSet(original));
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef}>
      <ScopedOperation
        container={containerRef}
        item={{ value: 'tasks', label: 'Tasks' }}
        action={{ value: 'assign', label: 'Assign' }}
        config={{
          policyType: 'assignment',
          fields: [
            {
              key: 'tasks',
              label: 'Task scope',
              defaultValue: 'own',
              options: [
                { value: 'own', label: 'Own tasks' },
                { value: 'all', label: 'All tasks' },
              ],
            },
            {
              key: 'people',
              label: 'Eligible assignees',
              defaultValue: 'department',
              options: [{ value: 'department', label: 'Department members' }],
            },
          ],
        }}
        grant={draft.grants[0]}
        disabled={false}
        onToggle={() => {}}
        onChange={(grant) => setDraft({ ...draft, grants: [grant] })}
      />
      <output data-testid='policy'>
        {JSON.stringify(toInput(draft).grants[0].actions[0].policy)}
      </output>
    </div>
  );
}
it('edits named business scopes in the configuration drawer without discarding the other scope', async () => {
  render(<Harness />);
  expect(
    screen.getByRole('img', { name: 'Limited access' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tasks: Assign' }));
  expect(screen.getByText('Eligible assignees')).toBeVisible();
  expect(
    screen.getByRole('radio', { name: 'Configure permission' }),
  ).toBeChecked();
  expect(screen.getByRole('radio', { name: 'No access' })).not.toBeChecked();
  fireEvent.click(screen.getAllByRole('combobox')[0]);
  const option = await screen.findByRole('option', { name: 'All tasks' });
  fireEvent.pointerDown(option, { pointerType: 'mouse' });
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  expect(JSON.parse(screen.getByTestId('policy').textContent!)).toEqual({
    type: 'assignment',
    tasks: 'all',
    people: 'department',
    futureConstraint: { keep: true },
  });
});
