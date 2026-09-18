// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  AuthorizationSubject,
  SubjectTypeOption,
} from '../client/authorization-client.js';
const authz = vi.hoisted(() => ({
  listSubjects: vi.fn(),
  resolveSubjects: vi.fn(),
}));
vi.mock('../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => authz,
}));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { SubjectsEditor } from '../client/components/subjects-editor.js';
import en from '../client/locales/en-US.js';
const types: readonly SubjectTypeOption[] = [
  {
    value: 'authenticated',
    label: 'Everyone',
    selection: { type: 'fixed', id: '*' },
  },
  {
    value: 'department',
    label: 'Departments',
    selection: { type: 'collection' },
  },
  { value: 'position', label: 'Positions', selection: { type: 'collection' } },
];
function Editor({ initial = [] }: { initial?: AuthorizationSubject[] }) {
  const [value, setValue] = useState<readonly AuthorizationSubject[]>(initial);
  return (
    <>
      <SubjectsEditor
        types={types}
        settings='sharing-rules'
        value={value}
        onChange={setValue}
      />
      <output data-testid='value'>{JSON.stringify(value)}</output>
    </>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  authz.resolveSubjects.mockImplementation(
    (_settings: string, _type: string, ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, title: `Resolved ${id}` }))),
  );
  authz.listSubjects.mockImplementation(
    (_settings: string, type: string, query: { page: number }) =>
      Promise.resolve({
        items: [{ id: String(query.page), title: `${type} ${query.page}` }],
        total: 60,
      }),
  );
});
it('loads registered types and preserves selections across pages and types', async () => {
  render(<Editor />);
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'department 1' }),
  );
  fireEvent.click(screen.getByRole('button', { name: en.subjects.next }));
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'department 2' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Positions' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'position 1' }));
  expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual([
    { type: 'department', id: '1' },
    { type: 'department', id: '2' },
    { type: 'position', id: '1' },
  ]);
  fireEvent.change(screen.getByRole('textbox', { name: en.subjects.search }), {
    target: { value: 'manager' },
  });
  await waitFor(() =>
    expect(authz.listSubjects).toHaveBeenLastCalledWith(
      'sharing-rules',
      'position',
      { page: 1, pageSize: 30, search: 'manager' },
    ),
  );
});
it('resolves off-page names and retains unknown subjects when lookup is refused', async () => {
  authz.resolveSubjects.mockRejectedValue(new Error('Forbidden'));
  authz.listSubjects.mockRejectedValue(new Error('Forbidden'));
  render(
    <Editor
      initial={[
        { type: 'department', id: 'off-page' },
        { type: 'missing-plugin', id: 'saved' },
      ]}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
  expect(screen.getByTestId('value')).toHaveTextContent('saved');
  expect(screen.getByText('off-page (unresolved)')).toBeInTheDocument();
  fireEvent.click(
    screen.getAllByRole('button', { name: en.common.remove })[0]!,
  );
  expect(screen.getByTestId('value')).not.toHaveTextContent('off-page');
});
it('resolves more than 100 selections in batches and limits selected-list height', async () => {
  render(
    <Editor
      initial={Array.from({ length: 125 }, (_, index) => ({
        type: 'department',
        id: String(index),
      }))}
    />,
  );
  const name = await screen.findByText('Resolved 124');
  expect(name.closest('.max-h-48')).toHaveClass('overflow-y-auto');
  expect(
    authz.resolveSubjects.mock.calls.map(
      (call) => (call[2] as string[]).length,
    ),
  ).toEqual([100, 25]);
});
