import { selectOption } from './select-option.js';
// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { FilterNode } from '@nocobase/db';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { FilterEditor } from '../client/components/filter-editor.js';
import {
  emptyFilter,
  incompleteFilter,
} from '../client/components/filter-ast.js';
import { assertDatabaseScope, scopeAst } from '../server/database/scope.js';
import en from '../client/locales/en-US.js';
function Editor({ initial = emptyFilter() }: { initial?: FilterNode }) {
  const [value, setValue] = useState<FilterNode>(initial);
  return (
    <>
      <FilterEditor
        fields={['status', 'amount']}
        value={value}
        onChange={setValue}
      />
      <output data-testid='ast'>{JSON.stringify(value)}</output>
    </>
  );
}
it('outputs nested native AND/OR nodes with typed values accepted by the authorization boundary', async () => {
  render(<Editor />);
  fireEvent.click(
    screen.getByRole('button', { name: en.databasePolicy.addCondition }),
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: en.databasePolicy.filterValue }),
    { target: { value: 'published' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: en.filterEditor.addGroup }),
  );
  await selectOption(
    screen.getAllByRole('combobox', { name: en.filterEditor.logic })[1]!,
    en.filterEditor.any,
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: en.databasePolicy.addCondition })[1]!,
  );
  await selectOption(
    screen.getAllByRole('combobox', {
      name: en.databasePolicy.filterField,
    })[1]!,
    'amount',
  );
  await selectOption(
    screen.getAllByRole('combobox', { name: en.filterEditor.valueType })[1]!,
    en.filterEditor.number,
  );
  fireEvent.change(
    screen.getByRole('spinbutton', { name: en.databasePolicy.filterValue }),
    { target: { value: '42' } },
  );
  const ast = JSON.parse(screen.getByTestId('ast').textContent!) as FilterNode;
  expect(ast).toEqual({
    kind: 'group',
    logic: 'and',
    items: [
      {
        kind: 'condition',
        path: ['status'],
        operator: '$eq',
        value: 'published',
      },
      {
        kind: 'group',
        logic: 'or',
        items: [
          { kind: 'condition', path: ['amount'], operator: '$eq', value: 42 },
        ],
      },
    ],
  });
  expect(() => assertDatabaseScope(ast, ['status', 'amount'])).not.toThrow();
  expect(scopeAst('orders', ast)).toMatchObject({
    kind: 'filter',
    version: 1,
    collection: 'orders',
    root: ast,
  });
  expect(incompleteFilter(ast)).toBe(false);
});
it('preserves unsupported nodes when editing a sibling and flags empty nested groups', () => {
  const relation = {
    kind: 'relation',
    path: ['owner'],
    quantifier: 'exists',
  } as const;
  render(
    <Editor initial={{ kind: 'group', logic: 'or', items: [relation] }} />,
  );
  expect(screen.getByText(en.filterEditor.unsupported)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: en.filterEditor.addGroup }),
  );
  const ast = JSON.parse(screen.getByTestId('ast').textContent!) as FilterNode;
  expect(ast).toMatchObject({
    items: [relation, { kind: 'group', logic: 'and', items: [] }],
  });
  expect(incompleteFilter(ast)).toBe(true);
});
