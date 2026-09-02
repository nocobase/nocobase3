/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowRunResultDialog } from '../../client/workflow-management/inspector.js';
import { workflowApi } from '../../client/workflow-management/data.js';
import {
  NodeDescriptionDialog,
  WorkflowDetailPage,
} from '../../client/workflow-management/pages.js';
import type { WorkflowNestedDefinition } from '../../client/types.js';

const canvasDefinitions = vi.hoisted(() => [] as WorkflowNestedDefinition[]);

vi.mock('../../client/workflow-management/workflow-canvas.js', async () => {
  const { createElement } = await import('react');
  return {
    WorkflowCanvas: ({
      definition,
      onSelectNode,
    }: {
      definition: WorkflowNestedDefinition;
      onSelectNode?: (nodeKey: string | null) => void;
    }) => {
      canvasDefinitions.push(definition);
      return createElement(
        'button',
        { type: 'button', onClick: () => onSelectNode?.('notify') },
        'Notify owner node',
      );
    },
  };
});

const nodeRun = {
  id: 'node-run-1',
  workflowRunId: 'run-1',
  nodeId: 'node-1',
  nodeKey: 'notify',
  status: 1,
  startedAt: '2026-09-02T08:00:00.000Z',
  finishedAt: '2026-09-02T08:00:01.000Z',
  branchKey: null,
};

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    key: 'notification',
    title: 'Notification workflow',
    description: null,
    enabled: false,
    current: null,
    hasParameters: false,
    executed: 0,
    version: '1.0.0',
    hash: 'workflow-hash',
    inputSchema: {},
    parametersSchema: {},
    parameterValues: {},
    nodes: [
      {
        id: 'node-1',
        key: 'notify',
        title: 'Notify owner',
        description: 'Send the final result to the record owner.',
        type: 'run',
        config: {},
        upstreamKey: null,
        downstreamKey: null,
        branchKey: null,
      },
    ],
    ...overrides,
  };
}

function CurrentLocation() {
  return (
    <output aria-label='Current location'>{useLocation().pathname}</output>
  );
}

describe('workflow node descriptions', () => {
  afterEach(() => {
    cleanup();
    canvasDefinitions.length = 0;
    vi.restoreAllMocks();
  });

  it('keeps the canvas definition stable when the description dialog closes', async () => {
    vi.spyOn(workflowApi, 'workflow').mockResolvedValue(
      workflow({ enabled: true, current: true }),
    );

    render(
      <MemoryRouter initialEntries={['/workflows/workflow-1']}>
        <Routes>
          <Route
            path='/workflows/:workflowId'
            element={<WorkflowDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Notify owner node'));
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(canvasDefinitions.length).toBeGreaterThan(1);
    expect(new Set(canvasDefinitions).size).toBe(1);
  });

  it('reloads the current workflow after changing its enabled status', async () => {
    const getWorkflow = vi
      .spyOn(workflowApi, 'workflow')
      .mockResolvedValueOnce(workflow())
      .mockResolvedValueOnce(workflow({ enabled: true, current: true }));
    vi.spyOn(workflowApi, 'enable').mockResolvedValue(
      workflow({ enabled: true, current: true }),
    );

    render(
      <MemoryRouter initialEntries={['/workflows/workflow-1']}>
        <Routes>
          <Route
            path='/workflows/:workflowId'
            element={<WorkflowDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Enable Notification workflow',
      }),
    );

    await waitFor(() => expect(getWorkflow).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('switch', {
        name: 'Disable Notification workflow',
      }),
    ).toBeDefined();
  });

  it('opens the returned workflow id after its first enable', async () => {
    vi.spyOn(workflowApi, 'workflow').mockImplementation(async (id) =>
      workflow({
        id: id === 'workflow-hash' ? null : id,
        enabled: id !== 'workflow-hash',
        current: id !== 'workflow-hash' ? true : null,
      }),
    );
    vi.spyOn(workflowApi, 'enable').mockResolvedValue(
      workflow({ id: 'workflow-42', enabled: true, current: true }),
    );

    render(
      <MemoryRouter initialEntries={['/workflows/workflow-hash']}>
        <CurrentLocation />
        <Routes>
          <Route
            path='/workflows/:workflowId'
            element={<WorkflowDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Enable Notification workflow',
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Current location').textContent).toBe(
        '/settings/automation/workflows/workflow-42',
      ),
    );
  });

  it('opens the execution canvas after a manual run', async () => {
    vi.spyOn(workflowApi, 'workflow').mockResolvedValue(
      workflow({ enabled: true, current: true }),
    );
    vi.spyOn(workflowApi, 'execute').mockResolvedValue({
      id: 'run-42',
      workflowId: 'workflow-1',
      workflowKey: 'notification',
      eventKey: 'manual-event',
      status: null,
      createdAt: '2026-09-02T08:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={['/workflows/workflow-1']}>
        <CurrentLocation />
        <Routes>
          <Route
            path='/workflows/:workflowId'
            element={<WorkflowDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(await screen.findByText('Run manually'));

    await waitFor(() =>
      expect(screen.getByLabelText('Current location').textContent).toBe(
        '/settings/automation/workflow-runs/run-42',
      ),
    );
  });

  it('shows the selected canvas node description in a dialog', () => {
    render(
      <NodeDescriptionDialog
        title='Notify owner'
        description='Send the final result to the record owner.'
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Notify owner' })).toBeDefined();
    expect(
      screen.getByText('Send the final result to the record owner.'),
    ).toBeDefined();
  });

  it('keeps the execution node description collapsed until requested', () => {
    vi.spyOn(workflowApi, 'nodeRuns').mockReturnValue(new Promise(() => {}));
    vi.spyOn(workflowApi, 'payload').mockReturnValue(new Promise(() => {}));

    render(
      <WorkflowRunResultDialog
        runId='run-1'
        nodeRun={nodeRun}
        nodeTitle='Notify owner'
        nodeDescription='Send the final result to the record owner.'
        onClose={() => {}}
      />,
    );

    const disclosure = screen
      .getByText('Description')
      .closest<HTMLDetailsElement>('details');
    expect(disclosure?.open).toBe(false);

    fireEvent.click(screen.getByText('Description'));
    expect(disclosure?.open).toBe(true);
    expect(
      screen.getByText('Send the final result to the record owner.'),
    ).toBeDefined();
  });
});
