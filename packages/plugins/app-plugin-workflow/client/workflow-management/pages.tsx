import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '@refinedev/core';
import { Link, useNavigate, useOutlet, useParams } from 'react-router';
import { Switch } from './ui/switch.js';
import { Badge } from './ui/badge.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import {
  buildExecutionOverlay,
  projectWorkflowGraph,
  restoreFromFlatIr,
  type JsonObject,
  type WorkflowNestedDefinition,
} from '@nocobase/app-plugin-workflow/client';
import { createWorkflowEventKey, workflowApi } from './data.js';
import { WorkflowInputDialog, WorkflowRunResultDialog } from './inspector.js';
import type {
  WorkflowDetailRecord,
  WorkflowListRecord,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
} from './types.js';
import { WorkflowCanvas } from './workflow-canvas.js';
import { WORKFLOW_SETTING_PATHS } from '../route-contracts.js';
import './workflow-canvas.css';

function workflowPath(workflowId: string): string {
  return `${WORKFLOW_SETTING_PATHS.workflows}/${encodeURIComponent(workflowId)}`;
}

function workflowRunPath(runId: string): string {
  return `${WORKFLOW_SETTING_PATHS.workflowRuns}/${encodeURIComponent(runId)}`;
}

function statusLabel(status: number | null): string {
  return status == null
    ? 'Queued'
    : status === 0
      ? 'Running'
      : status === 1
        ? 'Resolved'
        : status === -1
          ? 'Failed'
          : status === -2
            ? 'Error'
            : status === -3
              ? 'Aborted'
              : 'Unknown';
}

function statusTone(status: number | null): string {
  return status == null
    ? 'queued'
    : status === 0
      ? 'running'
      : status === 1
        ? 'resolved'
        : status === -1
          ? 'failed'
          : status === -2
            ? 'error'
            : status === -3
              ? 'aborted'
              : 'unknown';
}

function WorkflowRunStatusTag({
  status,
}: {
  status: number | null;
}): React.ReactElement {
  return (
    <Badge className={`workflow-run-status-tag ${statusTone(status)}`}>
      {statusLabel(status)}
    </Badge>
  );
}
function WorkflowStatusSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <span className='workflow-status-switch'>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        size='labeled'
      />
      <span aria-hidden='true' className='workflow-status-switch-label'>
        <span className='workflow-status-switch-on'>On</span>
        <span className='workflow-status-switch-off'>Off</span>
      </span>
    </span>
  );
}
function formatTime(value?: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}
function formatTriggeredTime(value?: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(value))
    : '—';
}
function duration(run: WorkflowRunRecord): string {
  const start = run.startedAt ?? run.createdAt;
  if (!start) return '—';
  const elapsed = Math.max(
    0,
    (run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now()) -
      new Date(start).getTime(),
  );
  return elapsed < 1000 ? `${elapsed} ms` : `${(elapsed / 1000).toFixed(1)} s`;
}
function contextProperties(
  schema: object,
): Record<
  string,
  { type?: string; title?: string; description?: string; default?: unknown }
> {
  const candidate = schema as {
    properties?: Record<
      string,
      { type?: string; title?: string; description?: string; default?: unknown }
    >;
  };
  return candidate.properties ?? {};
}
function displayInputValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  if (typeof value === 'symbol') return value.toString();
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '[Unserializable value]';
  }
}
function definition(workflow: WorkflowDetailRecord): WorkflowNestedDefinition {
  return restoreFromFlatIr({
    title: workflow.title ?? workflow.key,
    ...(workflow.description ? { description: workflow.description } : {}),
    inputSchema: workflow.inputSchema,
    parameters: normalizeWorkflowParameters(workflow.parametersSchema),
    start: workflow.nodes.find((node) => node.upstreamKey == null)?.key ?? null,
    nodes: workflow.nodes.map((node) => ({
      key: node.key,
      title: node.title ?? undefined,
      description: node.description ?? undefined,
      type: node.type,
      config: node.config,
      upstreamKey: node.upstreamKey,
      downstreamKey: node.downstreamKey,
      branchKey: node.branchKey,
    })),
  });
}
function normalizeWorkflowParameters(
  parametersSchema: WorkflowDetailRecord['parametersSchema'],
): JsonObject {
  return Object.fromEntries(
    Object.entries(parametersSchema).map(([key, input]) => [
      key,
      {
        type: input.type,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.default === undefined ? {} : { default: input.default }),
        ...(input.enum === undefined ? {} : { enum: input.enum }),
      },
    ]),
  );
}
function useAsync<T>(load: () => Promise<T>): {
  value: T | null;
  error: string | null;
  reload: () => void;
} {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    load: () => Promise<T>;
    value: T | null;
    error: string | null;
  }>(() => ({ load, value: null, error: null }));
  useEffect(() => {
    let active = true;
    const requestedRevision = revision;
    void load().then(
      (next) =>
        active &&
        requestedRevision === revision &&
        setResult({ load, value: next, error: null }),
      (cause: unknown) =>
        active &&
        setResult({
          load,
          value: null,
          error: cause instanceof Error ? cause.message : String(cause),
        }),
    );
    return () => {
      active = false;
    };
  }, [load, revision]);
  return {
    ...(result.load === load ? result : { value: null, error: null }),
    reload: () => setRevision((current) => current + 1),
  };
}

function InputDialog({
  workflow,
  onClose,
}: {
  workflow: WorkflowDetailRecord;
  onClose: () => void;
}): React.ReactElement {
  const workflowId = workflow.id ?? workflow.hash;
  if (!workflowId)
    throw new Error('Workflow has no identifier for editing parameters.');
  const [values, setValues] = useState(workflow.parameterValues);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size='md'>
        <DialogHeader>
          <DialogTitle>Parameter settings</DialogTitle>
        </DialogHeader>
        <form
          className='workflow-parameter-form'
          onSubmit={(event) => {
            event.preventDefault();
            void workflowApi.parameters(workflowId, values).then(onClose);
          }}
        >
          {Object.entries(workflow.parametersSchema).map(([key, item]) => (
            <label className='workflow-parameter-field' key={key}>
              <span>{item.title ?? key}</span>
              <input
                placeholder={
                  item.default === undefined
                    ? 'Not set'
                    : displayInputValue(item.default)
                }
                value={
                  Object.hasOwn(values, key)
                    ? displayInputValue(values[key])
                    : ''
                }
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]:
                      item.type === 'number'
                        ? Number(event.target.value)
                        : event.target.value,
                  }))
                }
              />
              {item.description ? <small>{item.description}</small> : null}
            </label>
          ))}
          <DialogFooter>
            <button
              className='workflow-button workflow-button-outline'
              type='button'
              onClick={onClose}
            >
              Cancel
            </button>
            <button className='workflow-button' type='submit'>
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ManualRunDialog({
  workflow,
  onClose,
  onExecuted,
}: {
  workflow: WorkflowDetailRecord;
  onClose: () => void;
  onExecuted: (run: WorkflowRunRecord) => void;
}): React.ReactElement {
  const { open } = useNotification();
  const workflowId = workflow.id ?? workflow.hash;
  if (!workflowId)
    throw new Error('Workflow has no identifier for manual execution.');
  const properties = contextProperties(workflow.inputSchema);
  const [values, setValues] = useState<
    Record<string, string | number | boolean | undefined>
  >(() =>
    Object.fromEntries(
      Object.entries(properties)
        .filter(([, item]) => item.default !== undefined)
        .map(([key, item]) => [key, item.default as string | number | boolean]),
    ),
  );
  const run = (): void => {
    const input = Object.fromEntries(
      Object.entries(values).filter(
        ([, value]) => value !== undefined && value !== '',
      ),
    ) as Record<string, string | number | boolean>;
    void workflowApi
      .execute(workflowId, input, createWorkflowEventKey())
      .then((execution) => {
        onClose();
        onExecuted(execution);
      })
      .catch((cause: unknown) =>
        open?.({
          type: 'error',
          message: 'Unable to run workflow',
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size='md'>
        <DialogHeader>
          <DialogTitle>Run manually</DialogTitle>
          <DialogDescription>Fill in the workflow input.</DialogDescription>
        </DialogHeader>
        <form
          className='workflow-parameter-form'
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          {Object.entries(properties).map(([key, item]) =>
            item.type === 'boolean' ? (
              <label className='workflow-checkbox-field' key={key}>
                <input
                  type='checkbox'
                  checked={Boolean(values[key])}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                <span className='workflow-checkbox-copy'>
                  <span>{item.title ?? key}</span>
                  {item.description ? <small>{item.description}</small> : null}
                </span>
              </label>
            ) : (
              <label className='workflow-parameter-field' key={key}>
                <span>{item.title ?? key}</span>
                <input
                  type={
                    item.type === 'number' || item.type === 'integer'
                      ? 'number'
                      : 'text'
                  }
                  placeholder={
                    item.default === undefined
                      ? 'Not set'
                      : displayInputValue(item.default)
                  }
                  value={
                    Object.hasOwn(values, key)
                      ? displayInputValue(values[key])
                      : ''
                  }
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [key]:
                        item.type === 'number' || item.type === 'integer'
                          ? event.target.value === ''
                            ? undefined
                            : Number(event.target.value)
                          : event.target.value,
                    }))
                  }
                />
                {item.description ? <small>{item.description}</small> : null}
              </label>
            ),
          )}
          <DialogFooter>
            <button
              className='workflow-button workflow-button-outline'
              type='button'
              onClick={onClose}
            >
              Cancel
            </button>
            <button className='workflow-button' type='submit'>
              Run
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ExecutionDialog({
  runs,
  total,
  onClose,
}: {
  runs: readonly WorkflowRunRecord[];
  total: number;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='workflow-runs-dialog sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Runs</DialogTitle>
          <DialogDescription>{total} runs</DialogDescription>
        </DialogHeader>
        <ul className='workflow-list workflow-runs-dialog-list'>
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                className='execution-item'
                to={workflowRunPath(run.id)}
                onClick={onClose}
              >
                <div>
                  <span className='execution-item-title'>
                    <span className='execution-run-id'>#{run.id}</span>{' '}
                    <span className='execution-workflow-title'>
                      {run.workflowTitle ?? run.workflowKey}
                    </span>
                  </span>
                  <span className='execution-item-time'>
                    {formatTime(run.startedAt ?? run.createdAt)}
                  </span>
                </div>
                <div className='execution-item-meta'>
                  <WorkflowRunStatusTag status={run.status} />
                  <span>Duration {duration(run)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export interface NodeDescriptionDialogProps {
  description: string | null;
  title: string;
  onClose: () => void;
}

export function NodeDescriptionDialog({
  description,
  title,
  onClose,
}: NodeDescriptionDialogProps): React.ReactElement {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size='md'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <section className='workflow-node-description-dialog'>
          <h3>Description</h3>
          <p>{description?.trim() || 'No node description provided.'}</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
function WorkflowRow({
  item,
  onChange,
  onReload,
}: {
  item: WorkflowListRecord;
  onChange: (item: WorkflowListRecord) => void;
  onReload: () => void;
}): React.ReactElement | null {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<WorkflowRunRecord[] | null>(null);
  const [settings, setSettings] = useState<WorkflowDetailRecord | null>(null);
  const [manual, setManual] = useState<WorkflowDetailRecord | null>(null);
  const [running, setRunning] = useState(false);
  const { open } = useNotification();
  const identifier = item.id ?? item.hash;
  if (!identifier) return null;
  const execute = (): void => {
    setRunning(true);
    void workflowApi
      .workflow(identifier)
      .then((workflow) => {
        if (Object.keys(contextProperties(workflow.inputSchema)).length > 0) {
          setManual(workflow);
          return undefined;
        }
        return workflowApi
          .execute(identifier, {}, createWorkflowEventKey())
          .then((run) => navigate(workflowRunPath(run.id)));
      })
      .catch((cause: unknown) =>
        open?.({
          type: 'error',
          message: 'Unable to run workflow',
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      )
      .finally(() => setRunning(false));
  };
  return (
    <>
      <li>
        <div className='workflow-row-main'>
          <Link to={workflowPath(identifier)}>{item.title ?? item.key}</Link>
          <span aria-hidden='true' className='workflow-row-separator'>
            ·
          </span>
          {item.executed > 0 ? (
            <button
              type='button'
              className='workflow-execution-link'
              onClick={() =>
                void workflowApi.workflowRuns(identifier).then(setRuns)
              }
            >
              {item.executed} runs
            </button>
          ) : (
            <span className='workflow-execution-count'>0 runs</span>
          )}
        </div>
        <div className='workflow-row-actions'>
          <label className='workflow-switch'>
            <WorkflowStatusSwitch
              checked={item.enabled}
              label={`${item.enabled ? 'Disable' : 'Enable'} ${item.title ?? item.key}`}
              onCheckedChange={(enabled) => {
                const update = enabled
                  ? workflowApi.enable(identifier)
                  : workflowApi.status(identifier, false);
                void update.then((next) => {
                  onChange(next);
                  onReload();
                });
              }}
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label='More actions'
                  className='workflow-row-menu-trigger'
                  type='button'
                >
                  ···
                </button>
              }
            />
            <DropdownMenuContent
              align='end'
              className='workflow-row-menu-content'
            >
              <DropdownMenuItem
                disabled={!item.hasParameters}
                onClick={() =>
                  void workflowApi.workflow(identifier).then(setSettings)
                }
              >
                Parameter settings
              </DropdownMenuItem>
              <DropdownMenuItem disabled={running} onClick={execute}>
                {running ? 'Running…' : 'Run'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
      {runs ? (
        <ExecutionDialog
          runs={runs}
          total={item.executed}
          onClose={() => setRuns(null)}
        />
      ) : null}
      {settings ? (
        <InputDialog workflow={settings} onClose={() => setSettings(null)} />
      ) : null}
      {manual ? (
        <ManualRunDialog
          workflow={manual}
          onClose={() => setManual(null)}
          onExecuted={(run) => void navigate(workflowRunPath(run.id))}
        />
      ) : null}
    </>
  );
}

export function WorkflowListPage(): React.ReactElement {
  const detail = useOutlet();
  const [items, setItems] = useState<WorkflowListRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState('');
  const load = (): void => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (enabled) params.set('enabled', enabled);
    void workflowApi.workflows(params.size ? `?${params}` : '').then(setItems);
  };
  useEffect(load, [query, enabled]);
  if (detail) return detail;
  return (
    <main className='workflow-page'>
      <h1 className='text-2xl font-semibold tracking-tight'>Workflows</h1>
      <section className='workflow-list-card'>
        <header className='workflow-list-header'>
          <div className='workflow-filter-bar'>
            <input
              aria-label='Search workflow title'
              placeholder='Search workflow title'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label='Filter workflow status'
              value={enabled}
              onChange={(event) => setEnabled(event.target.value)}
            >
              <option value=''>All statuses</option>
              <option value='true'>Enabled</option>
              <option value='false'>Disabled</option>
            </select>
          </div>
          <button type='button' onClick={load}>
            Refresh
          </button>
        </header>
        <ul className='workflow-list'>
          {items?.map((item) => (
            <WorkflowRow
              key={item.id ?? item.hash ?? item.key}
              item={item}
              onReload={load}
              onChange={(next) =>
                setItems(
                  (current) =>
                    current?.map((candidate) =>
                      candidate.key === next.key ? next : candidate,
                    ) ?? null,
                )
              }
            />
          ))}
          {items?.length === 0 ? (
            <li className='workflow-list-empty'>No data to display</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}

export function WorkflowDetailPage(): React.ReactElement {
  const { workflowId = '' } = useParams();
  const navigate = useNavigate();
  const loadWorkflow = useCallback(
    () => workflowApi.workflow(workflowId),
    [workflowId],
  );
  const loaded = useAsync(loadWorkflow);
  const [revisionState, setRevisionState] = useState<{
    workflowId: string;
    items: WorkflowDetailRecord[] | null;
    loading: boolean;
  }>(() => ({ workflowId: '', items: null, loading: false }));
  const [dialog, setDialog] = useState<'parameters' | 'manual' | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRunRecord[] | null>(null);
  const workflow = loaded.value;
  const source = useMemo(
    () => (workflow ? definition(workflow) : null),
    [workflow],
  );
  if (!workflow || !source)
    return <main>{loaded.error ?? 'Loading workflow…'}</main>;
  const identifier = workflow.id ?? workflow.hash;
  if (!identifier)
    return (
      <main>Workflow has neither a synchronized id nor an artifact hash.</main>
    );
  const enabled = workflow.enabled;
  const hasInput =
    Object.keys(contextProperties(workflow.inputSchema)).length > 0;
  const revisions =
    revisionState.workflowId === workflowId ? revisionState.items : null;
  const revisionsLoading =
    revisionState.workflowId === workflowId && revisionState.loading;
  const selectedNode = workflow.nodes.find(
    (node) => node.key === selectedNodeKey,
  );
  const loadRevisions = (): void => {
    if (revisions || revisionsLoading) return;
    setRevisionState({ workflowId, items: null, loading: true });
    void workflowApi
      .revisions(workflowId)
      .then((items) => setRevisionState({ workflowId, items, loading: false }))
      .catch(() =>
        setRevisionState({ workflowId, items: null, loading: false }),
      );
  };
  return (
    <main className='workflow-page'>
      <Link to={WORKFLOW_SETTING_PATHS.workflows}>← Workflows</Link>
      <div className='workflow-title-row'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {workflow.title ?? workflow.key}
          </h1>
          <p>{workflow.description || 'No workflow description provided.'}</p>
        </div>
      </div>
      <section className='workflow-canvas-card'>
        <header className='workflow-canvas-header'>
          <div className='workflow-canvas-header-leading'>
            <label>
              Version{' '}
              <select
                value={identifier}
                onPointerDown={loadRevisions}
                onFocus={loadRevisions}
                onChange={(event) =>
                  void navigate(workflowPath(event.target.value))
                }
              >
                {(revisions ?? [workflow]).map((item) => (
                  <option
                    key={item.id ?? item.hash ?? item.key}
                    value={item.id ?? item.hash ?? item.key}
                  >
                    {item.version ?? 'Unpublished'}
                  </option>
                ))}
              </select>
            </label>
            <div className='workflow-execution-summary'>
              {workflow.executed > 0 ? (
                <button
                  type='button'
                  onClick={() =>
                    void workflowApi.workflowRuns(identifier).then(setRuns)
                  }
                >
                  {workflow.executed} runs
                </button>
              ) : (
                <span>0 runs</span>
              )}
            </div>
          </div>
          <div className='canvas-header-actions'>
            <label className='workflow-switch'>
              <WorkflowStatusSwitch
                checked={enabled}
                label={`${enabled ? 'Disable' : 'Enable'} ${workflow.title ?? workflow.key}`}
                onCheckedChange={(checked) => {
                  void (
                    checked
                      ? workflowApi.enable(identifier)
                      : workflowApi.status(identifier, false)
                  ).then((next) => {
                    const nextIdentifier = next.id ?? next.hash ?? identifier;
                    if (nextIdentifier !== workflowId) {
                      void navigate(workflowPath(nextIdentifier), {
                        replace: true,
                      });
                      return;
                    }
                    loaded.reload();
                  });
                }}
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label='More actions'
                    className='workflow-row-menu-trigger'
                    type='button'
                  >
                    ···
                  </button>
                }
              />
              <DropdownMenuContent
                align='end'
                className='workflow-row-menu-content'
              >
                <DropdownMenuItem
                  disabled={!workflow.hasParameters}
                  onClick={() => setDialog('parameters')}
                >
                  Parameter settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!workflow.id && !workflow.hash}
                  onClick={() =>
                    hasInput
                      ? setDialog('manual')
                      : void workflowApi
                          .execute(identifier, {}, createWorkflowEventKey())
                          .then((run) => navigate(workflowRunPath(run.id)))
                  }
                >
                  Run manually
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <WorkflowCanvas
          definition={source}
          selectedNodeKey={selectedNodeKey}
          onSelectNode={setSelectedNodeKey}
        />
      </section>
      {selectedNode ? (
        <NodeDescriptionDialog
          title={selectedNode.title ?? selectedNode.key}
          description={selectedNode.description}
          onClose={() => setSelectedNodeKey(null)}
        />
      ) : null}
      {dialog === 'parameters' ? (
        <InputDialog workflow={workflow} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'manual' ? (
        <ManualRunDialog
          workflow={workflow}
          onClose={() => setDialog(null)}
          onExecuted={(run) => void navigate(workflowRunPath(run.id))}
        />
      ) : null}
      {runs ? (
        <ExecutionDialog
          runs={runs}
          total={workflow.executed}
          onClose={() => setRuns(null)}
        />
      ) : null}
    </main>
  );
}

export function WorkflowRunListPage(): React.ReactElement {
  const detail = useOutlet();
  const [items, setItems] = useState<WorkflowRunRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const load = (): void => {
    const params = new URLSearchParams();
    if (query) params.set('workflowTitle', query);
    if (status) params.set('status', status);
    void workflowApi.runs(params.size ? `?${params}` : '').then(setItems);
  };
  useEffect(load, [query, status]);
  if (detail) return detail;
  return (
    <main className='workflow-page'>
      <h1 className='text-2xl font-semibold tracking-tight'>Workflow runs</h1>
      <section className='workflow-list-card'>
        <header className='workflow-list-header'>
          <div className='workflow-filter-bar'>
            <input
              aria-label='Filter workflow title'
              placeholder='Filter workflow title'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label='Filter run status'
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value=''>All statuses</option>
              <option value='0'>Running</option>
              <option value='1'>Resolved</option>
              <option value='-1'>Failed</option>
              <option value='-2'>Error</option>
            </select>
          </div>
          <button type='button' onClick={load}>
            Refresh
          </button>
        </header>
        <ul className='workflow-list workflow-run-list'>
          {items?.map((run) => (
            <li key={run.id}>
              <Link className='execution-item' to={workflowRunPath(run.id)}>
                <div>
                  <span className='execution-item-title'>
                    <span className='execution-run-id'>#{run.id}</span>{' '}
                    <span className='execution-workflow-title'>
                      {run.workflowTitle ?? run.workflowKey}
                    </span>
                  </span>
                  <span className='execution-item-time'>
                    {formatTime(run.startedAt ?? run.createdAt)}
                  </span>
                </div>
                <div className='execution-item-meta'>
                  <WorkflowRunStatusTag status={run.status} />
                  <span>Duration {duration(run)}</span>
                </div>
              </Link>
            </li>
          ))}
          {items?.length === 0 ? (
            <li className='workflow-list-empty'>No data to display</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}

export function WorkflowRunDetailPage(): React.ReactElement {
  const { runId = '' } = useParams();
  const [nodeRun, setNodeRun] = useState<WorkflowNodeRunRecord | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const loadRun = useCallback(() => workflowApi.run(runId), [runId]);
  const state = useAsync(loadRun);
  const run = state.value;
  const workflowId = run?.workflowId;
  const loadWorkflow = useCallback(
    () =>
      workflowId
        ? workflowApi.workflow(workflowId)
        : Promise.reject(new Error('Loading workflow')),
    [workflowId],
  );
  const workflow = useAsync(loadWorkflow);
  const source = useMemo(
    () => (workflow.value ? definition(workflow.value) : null),
    [workflow.value],
  );
  if (!run || !workflow.value || !source)
    return <main>{state.error ?? workflow.error ?? 'Loading run…'}</main>;
  const nodes = run.nodeRuns ?? [];
  const graph = projectWorkflowGraph(source);
  const selectedNode = workflow.value.nodes.find(
    (item) => item.key === nodeRun?.nodeKey,
  );
  const title = selectedNode?.title ?? nodeRun?.nodeKey;
  const description = selectedNode?.description ?? null;
  return (
    <main className='workflow-page'>
      <Link to={WORKFLOW_SETTING_PATHS.workflowRuns}>← Runs</Link>
      <div className='workflow-title-row'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {run.workflowTitle ?? run.workflowKey}
            <span className='workflow-run-title-version'>
              {run.workflowVersion ?? 'Unpublished'}
            </span>
          </h1>
        </div>
      </div>
      <section className='workflow-canvas-card'>
        <header className='workflow-canvas-header workflow-run-detail-header'>
          <span className='workflow-run-triggered-at'>
            Triggered at {formatTriggeredTime(run.createdAt ?? run.startedAt)}
          </span>
          <div className='workflow-run-detail-meta'>
            <WorkflowRunStatusTag status={run.status} />
            <span>Duration {duration(run)}</span>
          </div>
        </header>
        <WorkflowCanvas
          definition={source}
          overlay={buildExecutionOverlay(graph, run.id, run.status, nodes)}
          nodeRuns={nodes}
          onViewNodeRun={setNodeRun}
          onViewStartInput={() => setInputOpen(true)}
        />
      </section>
      {nodeRun ? (
        <WorkflowRunResultDialog
          runId={run.id}
          nodeRun={nodeRun}
          nodeTitle={title}
          nodeDescription={description}
          onClose={() => setNodeRun(null)}
        />
      ) : null}
      {inputOpen ? (
        <WorkflowInputDialog
          input={run.input}
          onClose={() => setInputOpen(false)}
        />
      ) : null}
    </main>
  );
}
