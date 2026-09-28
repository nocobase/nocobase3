/** @vitest-environment jsdom */
import { I18nProvider } from '@nocobase/i18n/client';
import { Toast } from '@base-ui/react/toast';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import {
  WorkflowDetailPage,
  WorkflowListPage,
} from '../../client/workflow-management/pages.js';
import * as parameterForm from '../../client/workflow-management/parameter-form.js';
import { workflowApi } from '../../client/workflow-management/data.js';
import clientLocales from '../../client/locales/index.js';
import { createWorkflowI18nRuntime } from '../i18n.js';
import { version } from './version-fixtures.js';
import { openMenu } from './menu.js';
import { WORKFLOW_SETTING_PATHS } from '../../client/route-contracts.js';
vi.mock('../../client/workflow-management/workflow-canvas.js', () => ({
  WorkflowCanvas: () => <div>Canvas</div>,
}));
const runtime = await createWorkflowI18nRuntime(clientLocales);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Location(): React.ReactElement {
  return <output data-testid='location'>{useLocation().pathname}</output>;
}
function open(path: string): ReturnType<typeof render> {
  return render(
    <Toast.Provider>
      <I18nProvider runtime={runtime}>
        <MemoryRouter initialEntries={[path]}>
          <Location />
          <Routes>
            <Route
              path={`${WORKFLOW_SETTING_PATHS.workflows}/source/:sourceKey`}
              element={<WorkflowDetailPage />}
            />
            <Route
              path={`${WORKFLOW_SETTING_PATHS.workflows}/:id`}
              element={<WorkflowDetailPage />}
            />
            <Route
              path={WORKFLOW_SETTING_PATHS.workflows}
              element={<WorkflowListPage />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </Toast.Provider>,
  );
}
it.each(['Parameter settings', 'Run manually'])(
  'prompts before %s on an unmaterialized detail, including after HMR',
  async (action) => {
    const first = version({
      id: null,
      hash: 'a'.repeat(64),
      title: 'First source',
    });
    const second = version({
      ...first,
      hash: 'b'.repeat(64),
      title: 'Second source',
    });
    const source = vi.spyOn(workflowApi, 'source').mockResolvedValue(first);
    vi.spyOn(workflowApi, 'sourceRevisions').mockResolvedValue([first]);
    const fixed = vi.spyOn(workflowApi, 'workflow');
    const execute = vi.spyOn(workflowApi, 'execute');
    const loader = vi.spyOn(parameterForm, 'loadWorkflowParameterForm');
    open(`${WORKFLOW_SETTING_PATHS.workflows}/source/flow`);
    await screen.findByRole('heading', { name: 'First source' });
    await openMenu('More actions');
    fireEvent.click(await screen.findByRole('menuitem', { name: action }));
    await screen.findByRole('dialog', { name: 'Enable this version first' });
    source.mockResolvedValue(second);
    act(() =>
      window.dispatchEvent(new CustomEvent('nocobase:workflow-source-updated')),
    );
    await screen.findByRole('heading', { name: 'Second source' });
    await screen.findByRole('dialog', { name: 'Enable this version first' });
    expect(execute).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
    expect(fixed).not.toHaveBeenCalled();
  },
);
it.each(['Parameter settings', 'Run'])(
  'prompts before %s from an unmaterialized list row without fetching forms',
  async (action) => {
    vi.spyOn(workflowApi, 'workflowPage').mockResolvedValue({
      data: [version({ id: null, hash: 'a'.repeat(64) })],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    const source = vi.spyOn(workflowApi, 'source');
    const fixed = vi.spyOn(workflowApi, 'workflow');
    const execute = vi.spyOn(workflowApi, 'execute');
    const loader = vi.spyOn(parameterForm, 'loadWorkflowParameterForm');
    open(WORKFLOW_SETTING_PATHS.workflows);
    await screen.findByRole('link', { name: 'Flow' });
    await openMenu('More actions');
    fireEvent.click(await screen.findByRole('menuitem', { name: action }));
    await screen.findByRole('dialog', { name: 'Enable this version first' });
    expect(source).not.toHaveBeenCalled();
    expect(fixed).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
  },
);
it('canonicalizes a valid unpublished hash URL before subsequent edits', async () => {
  const candidate = version({ id: null, version: null, hash: 'a'.repeat(64) });
  vi.spyOn(workflowApi, 'workflow').mockResolvedValue(candidate);
  vi.spyOn(workflowApi, 'revisions').mockResolvedValue([candidate]);
  vi.spyOn(workflowApi, 'source').mockResolvedValue(candidate);
  vi.spyOn(workflowApi, 'sourceRevisions').mockResolvedValue([candidate]);
  open(`${WORKFLOW_SETTING_PATHS.workflows}/${candidate.hash}`);
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toBe(
      `${WORKFLOW_SETTING_PATHS.workflows}/source/flow`,
    ),
  );
});
it('keeps materialized detail URLs pinned during source updates', async () => {
  const published = version({ id: '42' });
  const fixed = vi.spyOn(workflowApi, 'workflow').mockResolvedValue(published);
  vi.spyOn(workflowApi, 'revisions').mockResolvedValue([published]);
  const source = vi.spyOn(workflowApi, 'source');
  const path = `${WORKFLOW_SETTING_PATHS.workflows}/42`;
  open(path);
  await screen.findByRole('heading', { name: 'Flow' });
  act(() =>
    window.dispatchEvent(new CustomEvent('nocobase:workflow-source-updated')),
  );
  await waitFor(() => expect(fixed).toHaveBeenCalledTimes(2));
  expect(source).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe(path);
});
it('provides a route back to the list for an expired hash without guessing another workflow', async () => {
  vi.spyOn(workflowApi, 'workflow').mockRejectedValue(
    new Error('The workflow request is invalid.'),
  );
  vi.spyOn(workflowApi, 'revisions').mockResolvedValue([]);
  const source = vi.spyOn(workflowApi, 'source');
  open(`${WORKFLOW_SETTING_PATHS.workflows}/${'a'.repeat(64)}`);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'source has changed',
  );
  expect(
    screen
      .getByRole('link', { name: 'Back to workflows' })
      .getAttribute('href'),
  ).toBe(WORKFLOW_SETTING_PATHS.workflows);
  expect(source).not.toHaveBeenCalled();
});

it('navigates to the materialized id after enabling the displayed revision', async () => {
  const candidate = version({ id: null, version: null, hash: 'a'.repeat(64) });
  const published = version({
    ...candidate,
    id: '42',
    version: 'version-1',
    current: true,
    enabled: true,
  });
  vi.spyOn(workflowApi, 'source').mockResolvedValue(candidate);
  vi.spyOn(workflowApi, 'workflow').mockResolvedValue(published);
  vi.spyOn(workflowApi, 'revisions').mockResolvedValue([published]);
  vi.spyOn(workflowApi, 'sourceRevisions').mockResolvedValue([candidate]);
  const enable = vi.spyOn(workflowApi, 'enable').mockResolvedValue(published);
  const path = `${WORKFLOW_SETTING_PATHS.workflows}/source/flow`;
  open(path);
  fireEvent.click(await screen.findByRole('switch', { name: 'Enable Flow' }));
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toBe(
      `${WORKFLOW_SETTING_PATHS.workflows}/42`,
    ),
  );
  expect(enable).toHaveBeenCalledWith(candidate.hash);
});
it('links unpublished rows and pending revisions to source previews while keeping published rows pinned', async () => {
  vi.spyOn(workflowApi, 'workflowPage').mockResolvedValue({
    data: [
      version({ id: null, key: 'draft', title: 'Draft', hash: 'a'.repeat(64) }),
      version({
        id: '42',
        key: 'published',
        title: 'Published',
        pendingArtifact: { hash: 'b'.repeat(64), title: 'New' },
      }),
    ],
    meta: { page: 1, pageSize: 20, total: 2 },
  });
  open(WORKFLOW_SETTING_PATHS.workflows);
  expect(
    (await screen.findByRole('link', { name: 'Draft' })).getAttribute('href'),
  ).toBe(`${WORKFLOW_SETTING_PATHS.workflows}/source/draft`);
  expect(
    screen.getByRole('link', { name: 'Published' }).getAttribute('href'),
  ).toBe(`${WORKFLOW_SETTING_PATHS.workflows}/42`);
  expect(
    screen
      .getByRole('link', { name: 'New version available' })
      .getAttribute('href'),
  ).toBe(`${WORKFLOW_SETTING_PATHS.workflows}/source/published`);
});

it('runs a previously materialized disabled version without requiring parameter configuration', async () => {
  const published = version({ id: '42', enabled: false, hasParameters: true });
  vi.spyOn(workflowApi, 'workflow').mockResolvedValue(published);
  vi.spyOn(workflowApi, 'revisions').mockResolvedValue([published]);
  const execute = vi
    .spyOn(workflowApi, 'execute')
    .mockRejectedValue(new Error('test execution'));
  open(`${WORKFLOW_SETTING_PATHS.workflows}/42`);
  await screen.findByRole('heading', { name: 'Flow' });
  await openMenu('More actions');
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Run manually' }),
  );
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('42', {}, expect.any(String)),
  );
  expect(
    screen.queryByRole('dialog', { name: 'Enable this version first' }),
  ).toBeNull();
});
it('opens the returned id when enabling an unmaterialized list row', async () => {
  const candidate = version({ id: null, hash: 'a'.repeat(64) });
  const published = version({ id: '42', enabled: true });
  vi.spyOn(workflowApi, 'workflowPage').mockResolvedValue({
    data: [candidate],
    meta: { page: 1, pageSize: 20, total: 1 },
  });
  vi.spyOn(workflowApi, 'workflow').mockResolvedValue(published);
  vi.spyOn(workflowApi, 'revisions').mockResolvedValue([published]);
  vi.spyOn(workflowApi, 'enable').mockResolvedValue(published);
  open(WORKFLOW_SETTING_PATHS.workflows);
  fireEvent.click(await screen.findByRole('switch', { name: 'Enable Flow' }));
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toBe(
      `${WORKFLOW_SETTING_PATHS.workflows}/42`,
    ),
  );
});
