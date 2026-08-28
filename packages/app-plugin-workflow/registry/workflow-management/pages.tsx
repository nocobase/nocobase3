import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  useNavigate,
  useOutlet,
  useParams,
  useSearchParams,
} from 'react-router';
import { Switch } from '@/components/ui/switch';
import {
  buildExecutionOverlay,
  projectWorkflowGraph,
  restoreFromFlatIr,
  type JsonObject,
  type WorkflowNestedDefinition,
} from '@nocobase/app-plugin-workflow/client';
import { workflowApi } from './data';
import {
  WorkflowInputDialog,
  WorkflowInspector,
  WorkflowRunResultDialog,
} from './inspector';
import type {
  WorkflowDetailRecord,
  WorkflowListRecord,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
} from './types';
import { WorkflowCanvas } from './workflow-canvas';
import './workflow-canvas.css';

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
function formatTime(value?: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}
function formatRelativeTime(value: string): string {
  const elapsed = new Date(value).getTime() - Date.now();
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(elapsed / 3_600_000);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(elapsed / 86_400_000);
  if (Math.abs(days) < 7) return formatter.format(days, 'day');
  return formatTime(value);
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
} {
  const [result, setResult] = useState<{
    load: () => Promise<T>;
    value: T | null;
    error: string | null;
  }>(() => ({ load, value: null, error: null }));
  useEffect(() => {
    let active = true;
    void load().then(
      (next) => active && setResult({ load, value: next, error: null }),
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
  }, [load]);
  return result.load === load ? result : { value: null, error: null };
}

function InputDialog({
  workflow,
  onClose,
}: {
  workflow: WorkflowDetailRecord;
  onClose: () => void;
}): React.ReactElement {
  if (!workflow.id)
    throw new Error('Workflow must be synchronized before editing parameters.');
  const workflowId = workflow.id;
  const [values, setValues] = useState(workflow.parameterValues);
  return (
    <div className='workflow-result-backdrop' onMouseDown={onClose}>
      <section
        className='workflow-result-dialog'
        role='dialog'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Parameter settings</h2>
          <button type='button' onClick={onClose}>
            ×
          </button>
        </header>
        {Object.entries(workflow.parametersSchema).map(([key, item]) => (
          <label key={key}>
            {item.title ?? key}
            <input
              placeholder={
                item.default === undefined
                  ? 'Not set'
                  : displayInputValue(item.default)
              }
              value={
                Object.hasOwn(values, key) ? displayInputValue(values[key]) : ''
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
          </label>
        ))}
        <footer>
          <button type='button' onClick={onClose}>
            Cancel
          </button>
          <button
            type='button'
            onClick={() =>
              void workflowApi.parameters(workflowId, values).then(onClose)
            }
          >
            Save
          </button>
        </footer>
      </section>
    </div>
  );
}
function ManualRunDialog({
  workflow,
  onClose,
}: {
  workflow: WorkflowDetailRecord;
  onClose: () => void;
}): React.ReactElement {
  if (!workflow.id)
    throw new Error('Workflow must be synchronized before manual execution.');
  const workflowId = workflow.id;
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
      .execute(workflowId, input, crypto.randomUUID())
      .then(onClose);
  };
  return (
    <div className='workflow-result-backdrop' onMouseDown={onClose}>
      <section
        className='workflow-result-dialog'
        role='dialog'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>Run manually</h2>
            <p>Fill in the workflow input.</p>
          </div>
          <button type='button' onClick={onClose}>
            ×
          </button>
        </header>
        <div className='workflow-settings-fields'>
          {Object.entries(properties).map(([key, item]) => (
            <label key={key}>
              {item.title ?? key}
              <input
                type={
                  item.type === 'number' || item.type === 'integer'
                    ? 'number'
                    : item.type === 'boolean'
                      ? 'checkbox'
                      : 'text'
                }
                placeholder={
                  item.default === undefined
                    ? 'Not set'
                    : displayInputValue(item.default)
                }
                checked={
                  item.type === 'boolean' ? Boolean(values[key]) : undefined
                }
                value={
                  item.type === 'boolean'
                    ? undefined
                    : Object.hasOwn(values, key)
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
                        : item.type === 'boolean'
                          ? event.target.checked
                          : event.target.value,
                  }))
                }
              />
              {item.description ? <small>{item.description}</small> : null}
            </label>
          ))}
        </div>
        <footer>
          <button type='button' onClick={onClose}>
            Cancel
          </button>
          <button type='button' onClick={run}>
            Run
          </button>
        </footer>
      </section>
    </div>
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
    <div className='workflow-result-backdrop' onMouseDown={onClose}>
      <section
        className='workflow-result-dialog'
        role='dialog'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>Execution records</h2>
            <p>{total} executions</p>
          </div>
          <button type='button' onClick={onClose}>
            ×
          </button>
        </header>
        {runs.map((run) => (
          <Link
            className='execution-item'
            key={run.id}
            to={`../../runs/${run.id}`}
            onClick={onClose}
          >
            <div>
              <span className='execution-item-title'>
                {run.workflowVersion ?? 'Unpublished'}{' '}
                <span className='execution-run-id'>#{run.id}</span>
              </span>
              <span>{formatTime(run.startedAt ?? run.createdAt)}</span>
            </div>
            <div className='execution-item-meta'>
              <span className='workflow-status'>{statusLabel(run.status)}</span>
              <span>Duration {duration(run)}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
function WorkflowRow({
  item,
  onChange,
}: {
  item: WorkflowListRecord;
  onChange: (item: WorkflowListRecord) => void;
}): React.ReactElement | null {
  const [runs, setRuns] = useState<WorkflowRunRecord[] | null>(null);
  const [settings, setSettings] = useState<WorkflowDetailRecord | null>(null);
  const identifier = item.id ?? item.hash;
  if (!identifier) return null;
  return (
    <>
      <li>
        <Link to={identifier}>{item.title ?? item.key}</Link>
        <div className='workflow-row-actions'>
          <label className='workflow-switch'>
            <Switch
              aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.title ?? item.key}`}
              checked={item.enabled}
              onCheckedChange={(enabled) => {
                const update = enabled
                  ? workflowApi.enable(identifier)
                  : workflowApi.status(identifier, false);
                void update.then(onChange);
              }}
            />
            {item.enabled ? 'Enabled' : 'Disabled'}
          </label>
          <button
            type='button'
            className='workflow-execution-link'
            onClick={() =>
              void workflowApi.workflowRuns(identifier).then(setRuns)
            }
          >
            Executed {item.executed} times
          </button>
          <details className='workflow-row-menu'>
            <summary aria-label='More actions'>···</summary>
            <div>
              <button
                type='button'
                disabled={!item.hasParameters}
                onClick={() =>
                  void workflowApi.workflow(identifier).then(setSettings)
                }
              >
                Parameter settings
              </button>
              <button
                type='button'
                onClick={() =>
                  void workflowApi.execute(identifier, {}, crypto.randomUUID())
                }
              >
                Run
              </button>
            </div>
          </details>
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
    </>
  );
}

export function WorkflowListPage(): React.ReactElement {
  const detail = useOutlet();
  const [items, setItems] = useState<WorkflowListRecord[]>([]);
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
      <h1>Workflows</h1>
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
          {items.map((item) => (
            <WorkflowRow
              key={item.id ?? item.hash ?? item.key}
              item={item}
              onChange={(next) =>
                setItems((current) =>
                  current.map((candidate) =>
                    candidate.key === next.key ? next : candidate,
                  ),
                )
              }
            />
          ))}
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
  const loadRevisions = useCallback(
    () => workflowApi.revisions(workflowId),
    [workflowId],
  );
  const loadRuns = useCallback(
    () => workflowApi.workflowRuns(workflowId),
    [workflowId],
  );
  const loaded = useAsync(loadWorkflow);
  const revisions = useAsync(loadRevisions);
  const runs = useAsync(loadRuns);
  const [dialog, setDialog] = useState<'parameters' | 'runs' | 'manual' | null>(
    null,
  );
  const [enabledState, setEnabledState] = useState<{
    workflowId: string;
    value: boolean;
  }>(() => ({ workflowId: '', value: false }));
  const workflow = loaded.value;
  if (!workflow) return <main>{loaded.error ?? 'Loading workflow…'}</main>;
  const identifier = workflow.id ?? workflow.hash;
  if (!identifier)
    return (
      <main>Workflow has neither a synchronized id nor an artifact hash.</main>
    );
  const enabled =
    enabledState.workflowId === identifier
      ? enabledState.value
      : workflow.enabled;
  const hasInput =
    Object.keys(contextProperties(workflow.inputSchema)).length > 0;
  return (
    <main className='workflow-page'>
      <Link to='..'>← Workflows</Link>
      <div className='workflow-title-row'>
        <div>
          <h1>{workflow.title ?? workflow.key}</h1>
          <p>{workflow.description || 'No workflow description provided.'}</p>
        </div>
      </div>
      <section className='workflow-canvas-card'>
        <header className='workflow-canvas-header'>
          <label>
            Version{' '}
            <select
              value={identifier}
              onChange={(event) => void navigate(`../${event.target.value}`)}
            >
              {(revisions.value ?? [workflow]).map((item) => (
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
            <button type='button' onClick={() => setDialog('runs')}>
              Executed {workflow.executed} times
            </button>
            {workflow.latestRun ? (
              <Link to={`../../runs/${workflow.latestRun.id}`}>
                Last run {formatRelativeTime(workflow.latestRun.createdAt)}
              </Link>
            ) : (
              <span>Not executed yet</span>
            )}
          </div>
          <div className='canvas-header-actions'>
            <label className='workflow-switch'>
              <input
                type='checkbox'
                checked={enabled}
                onChange={(event) =>
                  void (
                    event.target.checked
                      ? workflowApi.enable(identifier)
                      : workflowApi.status(identifier, false)
                  ).then((next) =>
                    setEnabledState({
                      workflowId: next.id ?? next.hash ?? identifier,
                      value: next.enabled,
                    }),
                  )
                }
              />
              {enabled ? 'Enabled' : 'Disabled'}
            </label>
            <button
              type='button'
              onClick={() => setDialog('parameters')}
              disabled={!workflow.id || !workflow.hasParameters}
            >
              Parameter settings
            </button>
            <button
              type='button'
              onClick={() =>
                hasInput
                  ? setDialog('manual')
                  : void workflowApi.execute(
                      identifier,
                      {},
                      crypto.randomUUID(),
                    )
              }
              disabled={!workflow.id}
            >
              Run manually
            </button>
          </div>
        </header>
        <WorkflowCanvas definition={definition(workflow)} />
      </section>
      {dialog === 'parameters' ? (
        <InputDialog workflow={workflow} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'runs' ? (
        <ExecutionDialog
          runs={runs.value ?? []}
          total={workflow.executed}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'manual' ? (
        <ManualRunDialog workflow={workflow} onClose={() => setDialog(null)} />
      ) : null}
    </main>
  );
}

export function WorkflowRunListPage(): React.ReactElement {
  const detail = useOutlet();
  const [items, setItems] = useState<WorkflowRunRecord[]>([]);
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
      <h1>Execution records</h1>
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
              aria-label='Filter execution status'
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
        <ul className='workflow-list'>
          {items.map((run) => (
            <li key={run.id}>
              <div>
                <Link to={run.id}>
                  {run.workflowTitle ?? run.workflowKey} <span>#{run.id}</span>
                </Link>
                <small>{formatTime(run.startedAt ?? run.createdAt)}</small>
              </div>
              <span>
                {statusLabel(run.status)} · Duration {duration(run)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export function WorkflowRunDetailPage(): React.ReactElement {
  const { runId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
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
  if (!run || !workflow.value)
    return <main>{state.error ?? workflow.error ?? 'Loading execution…'}</main>;
  const nodes = run.nodeRuns ?? [];
  const source = definition(workflow.value);
  const graph = projectWorkflowGraph(source);
  const selected = search.get('node');
  const title =
    workflow.value.nodes.find((item) => item.key === nodeRun?.nodeKey)?.title ??
    nodeRun?.nodeKey;
  return (
    <main className='workflow-page'>
      <Link to='..'>← Execution records</Link>
      <h1>#{run.id}</h1>
      <p>
        {statusLabel(run.status)} · {formatTime(run.startedAt ?? run.createdAt)}{' '}
        · Duration {duration(run)}
      </p>
      <WorkflowCanvas
        definition={source}
        overlay={buildExecutionOverlay(graph, run.id, run.status, nodes)}
        nodeRuns={nodes}
        selectedNodeKey={selected}
        onSelectNode={(key) =>
          setSearch((current) => {
            if (key) current.set('node', key);
            else current.delete('node');
            return current;
          })
        }
        onViewNodeRun={setNodeRun}
        onViewStartInput={() => setInputOpen(true)}
      />
      <WorkflowInspector
        nodeKey={selected}
        attempts={nodes.filter((item) => item.nodeKey === selected)}
      />
      {nodeRun ? (
        <WorkflowRunResultDialog
          runId={run.id}
          nodeRun={nodeRun}
          nodeTitle={title}
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
