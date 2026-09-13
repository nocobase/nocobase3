import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '@refinedev/core';
import type { Translator } from '@nocobase/i18n';
import { useTranslation } from '@nocobase/i18n/client';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.js';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js';
import { WORKFLOW_SETTING_PATHS } from '../route-contracts.js';
import { WORKFLOW_NS } from '../namespace.js';
import './workflow-canvas.css';

function workflowPath(workflowId: string): string {
  return `${WORKFLOW_SETTING_PATHS.workflows}/${encodeURIComponent(workflowId)}`;
}

function workflowRunPath(runId: string): string {
  return `${WORKFLOW_SETTING_PATHS.workflowRuns}/${encodeURIComponent(runId)}`;
}

function WorkflowTabs({
  active,
  onChange,
}: {
  active: 'workflows' | 'runs';
  onChange: (value: 'workflows' | 'runs') => void;
}): React.ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
  return (
    <nav aria-label={t('nav.automation')} className='workflow-tabs'>
      <button
        className={active === 'workflows' ? 'active' : ''}
        type='button'
        onClick={() => onChange('workflows')}
      >
        {t('nav.flow')}
      </button>
      <button
        className={active === 'runs' ? 'active' : ''}
        type='button'
        onClick={() => onChange('runs')}
      >
        {t('nav.runs')}
      </button>
    </nav>
  );
}

function statusLabel(status: number | null, t: Translator): string {
  return status == null
    ? t('status.queued')
    : status === 0
      ? t('status.running')
      : status === 1
        ? t('status.resolved')
        : status === -1
          ? t('status.failed')
          : status === -2
            ? t('status.error')
            : status === -3
              ? t('status.aborted')
              : t('status.unknown');
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
  const { t } = useTranslation(WORKFLOW_NS);
  return (
    <Badge className={`workflow-run-status-tag ${statusTone(status)}`}>
      {statusLabel(status, t)}
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
    <Switch
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      size='default'
    />
  );
}

function WorkflowPagination({
  pagination,
  onPageChange,
}: {
  pagination: { page: number; pageSize: number; total: number };
  onPageChange: (page: number) => void;
}): React.ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
  const pageCount = Math.ceil(pagination.total / pagination.pageSize);
  return (
    <nav className='workflow-pagination' aria-label={t('pagination.label')}>
      <span>
        {t('pagination.page', { page: pagination.page, total: pageCount })}
      </span>
      <div>
        <button
          type='button'
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          {t('pagination.previous')}
        </button>
        <button
          type='button'
          disabled={pagination.page >= pageCount}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          {t('pagination.next')}
        </button>
      </div>
    </nav>
  );
}

function formatTime(value?: string | null, locale?: string): string {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}
function formatTriggeredTime(value?: string | null, locale?: string): string {
  return value
    ? new Intl.DateTimeFormat(locale, {
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

export function InputDialog({
  workflow,
  onClose,
}: {
  workflow: WorkflowDetailRecord;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
  const workflowId = workflow.id ?? workflow.hash;
  if (!workflowId) throw new Error(t('workflows.parametersMissingIdentifier'));
  const [values, setValues] = useState(workflow.parameterValues);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size='md'>
        <DialogHeader>
          <DialogTitle>{t('actions.parameterSettings')}</DialogTitle>
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
              {item.type === 'boolean' ? (
                <Switch
                  checked={
                    Object.hasOwn(values, key)
                      ? values[key] === true
                      : item.default === true
                  }
                  onCheckedChange={(checked) =>
                    setValues((current) => ({ ...current, [key]: checked }))
                  }
                />
              ) : (
                <input
                  placeholder={
                    item.default === undefined
                      ? t('common.notSet')
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
              )}
              {item.description ? <small>{item.description}</small> : null}
            </label>
          ))}
          <DialogFooter>
            <button
              className='workflow-button workflow-button-outline'
              type='button'
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button className='workflow-button' type='submit'>
              {t('common.save')}
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
  const { t } = useTranslation(WORKFLOW_NS);
  const { open } = useNotification();
  const workflowId = workflow.id ?? workflow.hash;
  if (!workflowId) throw new Error(t('workflows.runMissingIdentifier'));
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
          message: t('workflows.runFailed'),
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size='md'>
        <DialogHeader>
          <DialogTitle>{t('manualRun.title')}</DialogTitle>
          <DialogDescription>{t('manualRun.description')}</DialogDescription>
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
                      ? t('common.notSet')
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
              {t('common.cancel')}
            </button>
            <button className='workflow-button' type='submit'>
              {t('common.run')}
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
  const { i18n, t } = useTranslation(WORKFLOW_NS);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='workflow-runs-dialog sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('runs.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('common.runCount', { count: total })}
          </DialogDescription>
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
                    {formatTime(
                      run.startedAt ?? run.createdAt,
                      i18n.resolvedLanguage,
                    )}
                  </span>
                </div>
                <div className='execution-item-meta'>
                  <WorkflowRunStatusTag status={run.status} />
                  <span>
                    {t('common.duration', { duration: duration(run) })}
                  </span>
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
  const { t } = useTranslation(WORKFLOW_NS);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size='md'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <section className='workflow-node-description-dialog'>
          <h3>{t('common.description')}</h3>
          <p>{description?.trim() || t('workflows.noNodeDescription')}</p>
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
  const { t } = useTranslation(WORKFLOW_NS);
  const navigate = useNavigate();
  const [runs, setRuns] = useState<WorkflowRunRecord[] | null>(null);
  const [settings, setSettings] = useState<WorkflowDetailRecord | null>(null);
  const [manual, setManual] = useState<WorkflowDetailRecord | null>(null);
  const [running, setRunning] = useState(false);
  const { open } = useNotification();
  const identifier = item.id ?? item.hash;
  if (!identifier) return null;
  const pendingArtifact = item.pendingArtifact;
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
          message: t('workflows.runFailed'),
          description: cause instanceof Error ? cause.message : String(cause),
        }),
      )
      .finally(() => setRunning(false));
  };
  return (
    <>
      <TableRow>
        <TableCell>
          <div className='workflow-row-main'>
            <div className='workflow-row-title'>
              <Link to={workflowPath(identifier)}>
                {item.title ?? item.key}
              </Link>
              {pendingArtifact ? (
                <Link
                  className='workflow-pending-version-link'
                  to={workflowPath(pendingArtifact.hash)}
                >
                  <Badge className='workflow-version-tag pending'>
                    {t('workflows.newVersionAvailable')}
                  </Badge>
                </Link>
              ) : null}
            </div>
          </div>
        </TableCell>
        <TableCell className='workflow-table-run-count-cell'>
          {item.executed > 0 ? (
            <button
              type='button'
              className='workflow-execution-link'
              onClick={() =>
                void workflowApi.workflowRuns(identifier).then(setRuns)
              }
            >
              {t('common.runCount', { count: item.executed })}
            </button>
          ) : (
            <span className='workflow-execution-count'>
              {t('common.runCount', { count: 0 })}
            </span>
          )}
        </TableCell>
        <TableCell className='workflow-table-status-cell'>
          <WorkflowStatusSwitch
            checked={item.enabled}
            label={t(
              item.enabled
                ? 'actions.disableWorkflow'
                : 'actions.enableWorkflow',
              { title: item.title ?? item.key },
            )}
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
        </TableCell>
        <TableCell className='workflow-table-actions-cell'>
          <div className='workflow-row-actions'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label={t('actions.more')}
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
                  {t('actions.parameterSettings')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={running} onClick={execute}>
                  {running ? t('common.running') : t('common.run')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
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
  const { t } = useTranslation(WORKFLOW_NS);
  const detail = useOutlet();
  const [items, setItems] = useState<WorkflowListRecord[] | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState('');
  const [activeTab, setActiveTab] = useState<'workflows' | 'runs'>('workflows');
  const load = useCallback(
    (nextPage: number): void => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (enabled) params.set('enabled', enabled);
      params.set('page', String(nextPage));
      params.set('pageSize', String(pagination.pageSize));
      void workflowApi.workflowPage(`?${params}`).then((result) => {
        setItems(result.data);
        setPagination(result.meta);
      });
    },
    [enabled, pagination.pageSize, query],
  );
  useEffect(() => load(1), [load]);
  if (detail) return detail;
  return (
    <main className='workflow-page'>
      <h1 className='text-2xl font-semibold tracking-tight'>
        {t('workflows.title')}
      </h1>
      <WorkflowTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'runs' ? (
        <WorkflowRunListPage embedded />
      ) : (
        <section className='workflow-list-card'>
          <header className='workflow-list-header'>
            <div className='workflow-filter-bar'>
              <input
                aria-label={t('filters.searchWorkflowTitle')}
                placeholder={t('filters.searchWorkflowTitle')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label={t('filters.workflowStatus')}
                value={enabled}
                onChange={(event) => setEnabled(event.target.value)}
              >
                <option value=''>{t('filters.allStatuses')}</option>
                <option value='true'>{t('status.enabled')}</option>
                <option value='false'>{t('status.disabled')}</option>
              </select>
            </div>
            <button
              className='workflow-button workflow-button-outline'
              type='button'
              onClick={() => load(pagination.page)}
            >
              {t('common.refresh')}
            </button>
          </header>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tables.workflow')}</TableHead>
                <TableHead>{t('tables.runCount')}</TableHead>
                <TableHead>{t('tables.status')}</TableHead>
                <TableHead>{t('tables.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((item) => (
                <WorkflowRow
                  key={item.id ?? item.hash ?? item.key}
                  item={item}
                  onReload={() => load(pagination.page)}
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
                <TableRow>
                  <TableCell className='workflow-list-empty' colSpan={4}>
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {pagination.total > pagination.pageSize ? (
            <WorkflowPagination
              pagination={pagination}
              onPageChange={(page) => load(page)}
            />
          ) : null}
        </section>
      )}
    </main>
  );
}

export function WorkflowDetailPage(): React.ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
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
  const loaded = useAsync(loadWorkflow);
  // Loaded with the definition rather than when the picker is opened. A native
  // select renders its options as the popup opens, so options that arrive while
  // it is open stay invisible until the next open -- and the candidate revision
  // is the one option someone opens this picker to find.
  const revisionList = useAsync(loadRevisions);
  const [dialog, setDialog] = useState<'parameters' | 'manual' | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRunRecord[] | null>(null);
  const workflow = loaded.value;
  const source = useMemo(
    () => (workflow ? definition(workflow) : null),
    [workflow],
  );
  if (!workflow || !source)
    return <main>{loaded.error ?? t('workflows.loading')}</main>;
  const identifier = workflow.id ?? workflow.hash;
  if (!identifier) return <main>{t('workflows.missingIdentifier')}</main>;
  const enabled = workflow.enabled;
  const pendingArtifact = workflow.pendingArtifact;
  const hasInput =
    Object.keys(contextProperties(workflow.inputSchema)).length > 0;
  const revisions = revisionList.value;
  // Enabling a revision that another revision has superseded swaps the version
  // the workflow runs, which is not what an enable/disable switch says it does.
  // A definition that has never been enabled has no current revision at all,
  // and keeps the switch the list page shows for it.
  const supersededRevision =
    workflow.version != null &&
    workflow.current !== true &&
    (revisions ?? []).some((item) => item.current === true);
  const selectedNode = workflow.nodes.find(
    (node) => node.key === selectedNodeKey,
  );
  const enableRevision = (target: string): void => {
    void workflowApi.enable(target).then((next) => {
      const nextIdentifier = next.id ?? next.hash ?? identifier;
      if (nextIdentifier === workflowId) {
        loaded.reload();
        revisionList.reload();
        return;
      }
      void navigate(workflowPath(nextIdentifier), { replace: true });
    });
  };
  return (
    <main className='workflow-page'>
      <Link to={WORKFLOW_SETTING_PATHS.workflows}>{t('workflows.back')}</Link>
      <div className='workflow-title-row'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {workflow.title ?? workflow.key}
          </h1>
          <p>{workflow.description || t('workflows.noDescription')}</p>
        </div>
      </div>
      <section className='workflow-canvas-card'>
        <header className='workflow-canvas-header'>
          <div className='workflow-canvas-header-leading'>
            <label>
              {t('workflows.version')}{' '}
              <Select
                value={identifier}
                onValueChange={(value) =>
                  value && void navigate(workflowPath(value))
                }
              >
                <SelectTrigger className='min-w-28'>
                  <SelectValue>
                    <span className={workflow.version ? '' : 'italic'}>
                      {workflow.version ?? t('common.unpublished')}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(revisions ?? [workflow]).map((item) => (
                    <SelectItem
                      key={item.id ?? item.hash ?? item.key}
                      value={item.id ?? item.hash ?? item.key}
                    >
                      <span
                        aria-hidden='true'
                        className='workflow-version-current-marker'
                      >
                        {item.current === true ? '>' : ''}
                      </span>
                      <span className={item.version ? '' : 'italic'}>
                        {item.version ?? t('common.unpublished')}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {pendingArtifact ? (
              <Link
                className='workflow-pending-version-link'
                to={workflowPath(pendingArtifact.hash)}
              >
                <Badge className='workflow-version-tag pending'>
                  {t('workflows.newVersionAvailable')}
                </Badge>
              </Link>
            ) : null}
            <div className='workflow-execution-summary'>
              {workflow.executed > 0 ? (
                <button
                  type='button'
                  onClick={() =>
                    void workflowApi.workflowRuns(identifier).then(setRuns)
                  }
                >
                  {t('common.runCount', { count: workflow.executed })}
                </button>
              ) : (
                <span>{t('common.runCount', { count: 0 })}</span>
              )}
            </div>
          </div>
          <div className='canvas-header-actions'>
            {supersededRevision ? (
              <button
                className='workflow-button workflow-button-outline'
                type='button'
                onClick={() => enableRevision(identifier)}
              >
                {t('actions.enableThisVersion')}
              </button>
            ) : (
              <>
                <label className='workflow-switch'>
                  <WorkflowStatusSwitch
                    checked={enabled}
                    label={t(
                      enabled
                        ? 'actions.disableWorkflow'
                        : 'actions.enableWorkflow',
                      { title: workflow.title ?? workflow.key },
                    )}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        enableRevision(identifier);
                        return;
                      }
                      void workflowApi
                        .status(identifier, false)
                        .then(() => loaded.reload());
                    }}
                  />
                </label>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label={t('actions.more')}
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
                  {t('actions.parameterSettings')}
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
                  {t('actions.runManually')}
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

export function WorkflowRunListPage({
  embedded = false,
}: { embedded?: boolean } = {}): React.ReactElement {
  const { i18n, t } = useTranslation(WORKFLOW_NS);
  const detail = useOutlet();
  const [items, setItems] = useState<WorkflowRunRecord[] | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(
    (nextPage: number): void => {
      const params = new URLSearchParams();
      if (query) params.set('workflowTitle', query);
      if (status) params.set('status', status);
      params.set('page', String(nextPage));
      params.set('pageSize', String(pagination.pageSize));
      void workflowApi.runPage(`?${params}`).then((result) => {
        setItems(result.data);
        setPagination(result.meta);
      });
    },
    [pagination.pageSize, query, status],
  );
  useEffect(() => load(1), [load]);
  if (detail) return detail;
  const content = (
    <section className='workflow-list-card'>
      <header className='workflow-list-header'>
        <div className='workflow-filter-bar'>
          <input
            aria-label={t('filters.filterWorkflowTitle')}
            placeholder={t('filters.filterWorkflowTitle')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label={t('filters.runStatus')}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value=''>{t('filters.allStatuses')}</option>
            <option value='0'>{t('status.running')}</option>
            <option value='1'>{t('status.resolved')}</option>
            <option value='-1'>{t('status.failed')}</option>
            <option value='-2'>{t('status.error')}</option>
          </select>
        </div>
        <button
          className='workflow-button workflow-button-outline'
          type='button'
          onClick={() => load(pagination.page)}
        >
          {t('common.refresh')}
        </button>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tables.workflow')}</TableHead>
            <TableHead>{t('tables.status')}</TableHead>
            <TableHead>{t('tables.triggeredAt')}</TableHead>
            <TableHead>{t('tables.duration')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Link
                  className='execution-item-title'
                  to={workflowRunPath(run.id)}
                >
                  <span className='execution-run-id'>#{run.id}</span>{' '}
                  <span className='execution-workflow-title'>
                    {run.workflowTitle ?? run.workflowKey}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <WorkflowRunStatusTag status={run.status} />
              </TableCell>
              <TableCell className='execution-item-time'>
                {formatTime(
                  run.startedAt ?? run.createdAt,
                  i18n.resolvedLanguage,
                )}
              </TableCell>
              <TableCell className='execution-item-meta'>
                {duration(run)}
              </TableCell>
            </TableRow>
          ))}
          {items?.length === 0 ? (
            <TableRow>
              <TableCell className='workflow-list-empty' colSpan={4}>
                {t('common.noData')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {pagination.total > pagination.pageSize ? (
        <WorkflowPagination
          pagination={pagination}
          onPageChange={(page) => load(page)}
        />
      ) : null}
    </section>
  );
  return embedded ? (
    content
  ) : (
    <main className='workflow-page'>
      <h1 className='text-2xl font-semibold tracking-tight'>
        {t('workflows.title')}
      </h1>
      <WorkflowTabs active='runs' onChange={() => undefined} />
      {content}
    </main>
  );
}

export function WorkflowRunDetailPage(): React.ReactElement {
  const { i18n, t } = useTranslation(WORKFLOW_NS);
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
        : Promise.reject(new Error(t('workflows.loading'))),
    [t, workflowId],
  );
  const workflow = useAsync(loadWorkflow);
  const source = useMemo(
    () => (workflow.value ? definition(workflow.value) : null),
    [workflow.value],
  );
  if (!run || !workflow.value || !source)
    return <main>{state.error ?? workflow.error ?? t('runs.loading')}</main>;
  const nodes = run.nodeRuns ?? [];
  const graph = projectWorkflowGraph(source);
  const selectedNode = workflow.value.nodes.find(
    (item) => item.key === nodeRun?.nodeKey,
  );
  const title = selectedNode?.title ?? nodeRun?.nodeKey;
  const description = selectedNode?.description ?? null;
  return (
    <main className='workflow-page'>
      <Link to={workflowPath(run.workflowId)}>{t('workflows.back')}</Link>
      <div className='workflow-title-row'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {run.workflowTitle ?? run.workflowKey}
            <span className='workflow-run-title-version'>
              {run.workflowVersion ?? t('common.unpublished')}
            </span>
          </h1>
        </div>
      </div>
      <section className='workflow-canvas-card'>
        <header className='workflow-canvas-header workflow-run-detail-header'>
          <span className='workflow-run-triggered-at'>
            {t('runs.triggeredAt', {
              time: formatTriggeredTime(
                run.createdAt ?? run.startedAt,
                i18n.resolvedLanguage,
              ),
            })}
          </span>
          <div className='workflow-run-detail-meta'>
            <WorkflowRunStatusTag status={run.status} />
            <span>{t('common.duration', { duration: duration(run) })}</span>
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
