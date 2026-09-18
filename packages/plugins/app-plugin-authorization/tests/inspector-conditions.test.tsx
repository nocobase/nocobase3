// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { InspectionConditions } from '../client/pages/inspector-conditions.js';
it('removes redundant display conditions without mutating the executable scope', () => {
  const condition = (value: string) => ({
    kind: 'condition',
    path: ['projectId'],
    operator: '$eq',
    value,
  });
  const root = {
    kind: 'group',
    logic: 'and',
    items: [
      condition('project-1'),
      {
        kind: 'group',
        logic: 'or',
        items: [condition('project-1'), condition('project-2')],
      },
    ],
  };
  const original = JSON.stringify(root);
  render(
    <InspectionConditions
      value={{ type: 'database', scope: { kind: 'filter', root }, fields: [] }}
    />,
  );
  expect(screen.getByText(/project-1/)).toBeVisible();
  expect(screen.queryByText(/project-2/)).not.toBeInTheDocument();
  expect(JSON.stringify(root)).toBe(original);
});
