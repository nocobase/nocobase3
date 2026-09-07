import {
  AlertCircle,
  Columns2,
  PanelLeft,
  PanelRight,
  Check,
  ChevronRight,
  ExternalLink,
  FileCode2,
  Info,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { parse as parseYaml } from 'yaml';
import type {
  ConfigMode,
  AppDetail,
  ConfigChangeSummary,
  DiffLine,
} from './types.js';
import { AppDialog } from './shared.js';
import { configModeLabel, shortId, formatDate, readError } from './utils.js';

export const ConfigEditor: import('react').LazyExoticComponent<
  (typeof import('../../components/config-editor.js'))['ConfigEditor']
> = lazy(async () => {
  const module = await import('../../components/config-editor.js');
  return { default: module.ConfigEditor };
});

export const ConfigMergeEditor: import('react').LazyExoticComponent<
  (typeof import('../../components/config-editor.js'))['ConfigMergeEditor']
> = lazy(async () => {
  const module = await import('../../components/config-editor.js');
  return { default: module.ConfigMergeEditor };
});

export const ConfigUnifiedDiff: import('react').LazyExoticComponent<
  (typeof import('../../components/config-editor.js'))['ConfigUnifiedDiff']
> = lazy(async () => {
  const module = await import('../../components/config-editor.js');
  return { default: module.ConfigUnifiedDiff };
});

const CONFIG_MODES: readonly {
  readonly value: ConfigMode;
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
}[] = [
  {
    value: 'file',
    title: 'Config file',
    description: 'Maintain an editable config.yml with the application.',
    icon: <FileCode2 />,
  },
  {
    value: 'managed',
    title: 'Hub managed',
    description: 'Store structured configuration and secrets in Hub.',
    icon: <Sparkles />,
    disabled: true,
  },
  {
    value: 'external',
    title: 'External',
    description: 'Supply configuration through external infrastructure.',
    icon: <ExternalLink />,
  },
];

export function Configuration({
  mode,
  content,
  busy,
  onSave,
}: {
  readonly mode: ConfigMode;
  readonly content: string;
  readonly busy: boolean;
  readonly onSave: (content: string) => void;
}): ReactElement {
  const source = CONFIG_MODES.find((item) => item.value === mode);
  const [draft, setDraft] = useState(content);
  const [reviewOpen, setReviewOpen] = useState(false);
  const validationError = validateConfigDocument(draft);
  const changed = draft !== content;
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>Configuration</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Configuration source used by this application.
          </p>
        </div>
        <Badge className='gap-1.5 bg-muted text-foreground [&_svg]:size-3.5'>
          {source?.icon} {source?.title ?? mode}
        </Badge>
      </div>
      {mode === 'file' ? (
        <div className='space-y-4'>
          <div className='overflow-hidden rounded-xl border'>
            <div className='border-b bg-muted/20 px-4 py-3'>
              <span className='flex items-center gap-2 text-sm font-medium'>
                <FileCode2 className='size-4' /> config.yml
              </span>
            </div>
            <Suspense fallback={<ConfigEditorFallback />}>
              <ConfigEditor value={draft} onChange={setDraft} />
            </Suspense>
          </div>
          <ConfigStatus
            error={validationError}
            summary={summarizeConfigChanges('file', 'file', content, draft)}
          />
          <ConfigReloadNotice />
          <div className='flex justify-end'>
            <Button
              disabled={busy || !changed || validationError !== null}
              onClick={() => setReviewOpen(true)}
            >
              {busy ? 'Publishing…' : 'Save and publish'}
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'external' ? (
        <Alert className='bg-muted/20'>
          <ExternalLink />
          <AlertDescription>
            Configuration and secrets are supplied by the runtime environment.
            Hub does not create, mount, or edit a configuration file for this
            deployment.
          </AlertDescription>
        </Alert>
      ) : null}
      {reviewOpen ? (
        <AppDialog
          wide
          title='Review configuration changes'
          description='Review the current and new configuration before publishing. This reloads configuration without restarting the application.'
          onClose={() => setReviewOpen(false)}
        >
          <ConfigChangesReview
            current={content}
            value={draft}
            baselineMode={mode}
            validationError={validationError}
            expanded
          />
          <div className='mt-4'>
            <ConfigReloadNotice />
          </div>
          <div className='mt-7 flex justify-between gap-2'>
            <Button variant='outline' onClick={() => setReviewOpen(false)}>
              Back
            </Button>
            <Button
              disabled={busy || !changed || validationError !== null}
              onClick={() => {
                setReviewOpen(false);
                onSave(draft);
              }}
            >
              Save and publish
            </Button>
          </div>
        </AppDialog>
      ) : null}
    </div>
  );
}

export function ConfigReloadNotice(): ReactElement {
  return (
    <Alert>
      <Info />
      <AlertDescription>
        Configuration reload does not restart the application. Services that
        support live updates apply changes immediately. Other changes take
        effect after the application restarts. Stopped applications load the
        configuration on next start.
      </AlertDescription>
    </Alert>
  );
}

export function ConfigChangesReview({
  current,
  value,
  baselineMode,
  validationError,
  expanded = false,
}: {
  readonly current: string;
  readonly value: string;
  readonly baselineMode: ConfigMode;
  readonly validationError: string | null;
  readonly expanded?: boolean;
}): ReactElement {
  return (
    <div className='space-y-4'>
      <ConfigStatus
        error={validationError}
        summary={summarizeConfigChanges(baselineMode, 'file', current, value)}
      />
      <details className='overflow-hidden rounded-lg border' open={expanded}>
        <summary className='cursor-pointer bg-muted/20 px-3 py-2 text-sm font-medium'>
          Review configuration changes
        </summary>
        <Suspense fallback={<ConfigEditorFallback />}>
          <ConfigUnifiedDiff
            current={baselineMode === 'file' ? current : ''}
            value={value}
          />
        </Suspense>
      </details>
    </div>
  );
}

export function DeploymentDialog({
  app,
  releaseId,
  mode,
  content,
  baselineContent,
  baselineMode,
  rollback,
  busy,
  onRelease,
  loadTemplate,
  onMode,
  onContent,
  onClose,
  onComplete,
}: {
  readonly app: AppDetail;
  readonly releaseId: string | undefined;
  readonly mode: ConfigMode;
  readonly content: string;
  readonly baselineContent: string;
  readonly baselineMode: ConfigMode;
  readonly rollback: boolean;
  readonly busy: boolean;
  readonly onRelease: (releaseId: string) => void;
  readonly loadTemplate: (
    appId: string,
    releaseId: string,
  ) => Promise<string | null>;
  readonly onMode: (mode: ConfigMode) => void;
  readonly onContent: (content: string) => void;
  readonly onClose: () => void;
  readonly onComplete: () => void;
}): ReactElement {
  const firstStep = rollback ? 1 : 0;
  const [step, setStep] = useState(firstStep);
  const [retry, setRetry] = useState(0);
  const [templateError, setTemplateError] = useState<string>();
  const [loadedReleaseId, setLoadedReleaseId] = useState<string>();
  const editingConfig = step > 0;
  const configReady = loadedReleaseId === releaseId && releaseId !== undefined;
  useEffect(() => {
    if (!editingConfig || !releaseId || loadedReleaseId === releaseId) return;
    let cancelled = false;
    void loadTemplate(app.app.id, releaseId)
      .then((template) => {
        if (cancelled) return;
        onContent(template ?? (baselineMode === 'file' ? baselineContent : ''));
        if (!rollback) onMode(template !== null ? 'file' : baselineMode);
        setLoadedReleaseId(releaseId);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setTemplateError(readError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [
    editingConfig,
    releaseId,
    loadedReleaseId,
    retry,
    loadTemplate,
    app.app.id,
    baselineMode,
    baselineContent,
    rollback,
    onContent,
    onMode,
  ]);
  const [visibleConfig, setVisibleConfig] = useState<
    'both' | 'current' | 'new'
  >('both');
  const release = app.releases.find((item) => item.id === releaseId);
  const validationError =
    mode === 'file' ? validateConfigDocument(content) : null;
  const summary = summarizeConfigChanges(
    baselineMode,
    mode,
    baselineContent,
    content,
  );
  return (
    <AppDialog
      title={rollback ? 'Roll back application' : 'Deploy application'}
      description={app.app.name}
      onClose={onClose}
      wide
    >
      <DeploymentSteps current={step} rollback={rollback} />
      <div>
        {step === 0 ? (
          <div className='max-h-[22rem] overflow-y-auto rounded-xl border'>
            {app.releases.map((item) => (
              <Button
                className={`grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] justify-stretch rounded-none border-b px-4 py-3 text-left last:border-0 ${releaseId === item.id ? 'bg-primary/5' : ''}`}
                disabled={busy}
                key={item.id}
                onClick={() => {
                  if (item.id !== releaseId) {
                    setLoadedReleaseId(undefined);
                    setTemplateError(undefined);
                  }
                  onRelease(item.id);
                }}
                variant='ghost'
              >
                <span className='flex items-center gap-3'>
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded-full border ${releaseId === item.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
                  >
                    {releaseId === item.id ? (
                      <Check className='size-3' />
                    ) : null}
                  </span>
                  <span>
                    <span className='block text-sm font-medium'>
                      v{item.version}
                    </span>
                    <span className='font-mono text-[11px] text-muted-foreground'>
                      {item.checksum.slice(0, 12)}
                    </span>
                  </span>
                </span>
                <span className='text-xs text-muted-foreground'>
                  {formatDate(item.createdAt)}
                </span>
              </Button>
            ))}
          </div>
        ) : !configReady ? (
          <div className='min-h-80 py-6'>
            {templateError ? (
              <Alert className='border-destructive/30 text-destructive'>
                <AlertCircle />
                <AlertDescription>
                  <p>Failed to load configuration template: {templateError}</p>
                  <Button
                    variant='outline'
                    onClick={() => {
                      setTemplateError(undefined);
                      setRetry((value) => value + 1);
                    }}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div
                role='status'
                className='flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground'
              >
                <LoaderCircle className='size-4 animate-spin' />
                Loading configuration template…
              </div>
            )}
          </div>
        ) : step === 1 ? (
          <div className='space-y-5'>
            {rollback ? (
              <div className='flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm'>
                <span className='text-muted-foreground'>Release</span>
                <span className='font-medium'>
                  {release ? `v${release.version}` : '—'}
                </span>
              </div>
            ) : null}
            {rollback ? (
              <div className='flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm'>
                <span className='text-muted-foreground'>
                  Configuration source
                </span>
                <span className='font-medium'>{configModeLabel(mode)}</span>
              </div>
            ) : (
              <ConfigModePicker value={mode} onChange={onMode} />
            )}
            {mode === 'file' ? (
              <div className='space-y-3'>
                {release?.hasConfigTemplate ? (
                  <Alert className='border-blue-500/25 bg-blue-500/5'>
                    <Info className='size-4 shrink-0 text-blue-600' />
                    <AlertDescription>
                      The Release template contains example configuration. If
                      you use it, replace example values, credentials, and
                      secrets with deployment-ready values.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div>
                  <div className='overflow-hidden rounded-xl border'>
                    <div className='flex flex-wrap items-end justify-between gap-3 border-b bg-muted/20 px-4 pt-3'>
                      <div className='pb-3'>
                        <div className='flex items-center gap-2 text-sm font-medium'>
                          <FileCode2 className='size-4 text-primary' />
                          Deployment configuration
                        </div>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Edit the configuration that will be used for this
                          deployment.
                        </p>
                      </div>
                      <div className='pb-3'>
                        <div
                          role='group'
                          aria-label='Configuration layout'
                          className='inline-flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5'
                        >
                          {(
                            [
                              [
                                'current',
                                'Current configuration only',
                                PanelLeft,
                              ],
                              ['both', 'Side by side', Columns2],
                              ['new', 'New configuration only', PanelRight],
                            ] as const
                          ).map(([value, label, Icon]) => (
                            <Button
                              key={value}
                              size='icon'
                              variant='ghost'
                              className={`size-7 rounded-md ${visibleConfig === value ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}
                              aria-label={label}
                              aria-pressed={visibleConfig === value}
                              title={label}
                              onClick={() => setVisibleConfig(value)}
                            >
                              <Icon className='size-4' />
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div
                        className={`grid ${visibleConfig === 'both' ? 'grid-cols-2 divide-x' : 'grid-cols-1'} border-b bg-muted/20`}
                      >
                        <div
                          hidden={visibleConfig === 'new'}
                          className='px-4 py-2.5'
                        >
                          <p className='text-xs font-medium'>Current</p>
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            {app.app.currentDeploymentId
                              ? `Deployment ${shortId(app.app.currentDeploymentId)} · Read-only`
                              : 'No active configuration'}
                          </p>
                        </div>
                        <div
                          hidden={visibleConfig === 'current'}
                          className='px-4 py-2.5'
                        >
                          <p className='text-xs font-medium'>
                            New configuration
                          </p>
                          <p className='mt-0.5 text-xs text-muted-foreground'>
                            {release?.hasConfigTemplate
                              ? `From Release v${release.version} template · Editable`
                              : baselineMode === 'file' &&
                                  app.app.currentDeploymentId
                                ? 'From current configuration · Editable'
                                : 'No Release template · Editable'}
                          </p>
                        </div>
                      </div>
                      <Suspense fallback={<ConfigEditorFallback />}>
                        <ConfigMergeEditor
                          current={
                            baselineMode === 'file' ? baselineContent : ''
                          }
                          onChange={onContent}
                          value={content}
                          visiblePane={visibleConfig}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {mode === 'external' ? (
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='rounded-xl border bg-muted/20 px-4 py-3'>
                  <p className='text-xs text-muted-foreground'>
                    Current configuration
                  </p>
                  <p className='mt-1 text-sm font-medium'>
                    {app.app.currentDeploymentId
                      ? configModeLabel(baselineMode)
                      : 'No active configuration'}
                  </p>
                </div>
                <div className='rounded-xl border border-primary/30 bg-primary/5 px-4 py-3'>
                  <p className='text-xs text-muted-foreground'>
                    New configuration
                  </p>
                  <p className='mt-1 text-sm font-medium'>External</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Runtime configuration and secrets are supplied outside Hub.
                  </p>
                </div>
              </div>
            ) : null}
            {mode === 'file' ? (
              <ConfigStatus error={validationError} summary={summary} />
            ) : null}
            {mode === 'file' ? (
              <Alert className='border-amber-500/30 bg-amber-500/5 text-amber-800'>
                <TriangleAlert className='size-4 shrink-0' />
                <AlertDescription className='text-amber-800'>
                  config.yml may contain secrets. Hub stores the complete file
                  for this application, and authorized administrators can view
                  its contents.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className='overflow-hidden rounded-xl border'>
            <div className='grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>Application</span>
              <span className='font-medium'>{app.app.name}</span>
            </div>
            <div className='grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>Release</span>
              <span className='font-medium'>
                {release ? `v${release.version}` : '—'}
              </span>
            </div>
            <div className='grid grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>Configuration</span>
              <span className='font-medium'>
                {mode === 'file' ? 'Config file' : 'External'}
              </span>
            </div>
            {mode === 'file' ? (
              <div className='space-y-4 p-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='rounded-lg border bg-muted/20 px-3 py-2.5'>
                    <p className='text-xs text-muted-foreground'>
                      Current configuration
                    </p>
                    <p className='mt-1 text-sm font-medium'>
                      {app.app.currentDeploymentId
                        ? `${configModeLabel(baselineMode)} · Deployment ${shortId(app.app.currentDeploymentId)}`
                        : 'No active configuration'}
                    </p>
                  </div>
                  <div className='rounded-lg border bg-primary/5 px-3 py-2.5'>
                    <p className='text-xs text-muted-foreground'>
                      New configuration
                    </p>
                    <p className='mt-1 text-sm font-medium'>
                      {`Config file · Release v${release?.version ?? '—'}`}
                    </p>
                  </div>
                </div>
                <ConfigChangesReview
                  current={baselineContent}
                  value={content}
                  baselineMode={baselineMode}
                  validationError={validationError}
                />
              </div>
            ) : (
              <div className='p-4'>
                <div className='flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700'>
                  <Check className='size-4 shrink-0' />
                  {summary.sourceChanged
                    ? `Configuration source changes from ${configModeLabel(baselineMode)} to External`
                    : 'No configuration source changes'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className='mt-7 flex justify-between gap-2'>
        <Button
          onClick={step === firstStep ? onClose : () => setStep(step - 1)}
          variant='outline'
        >
          {step === firstStep ? 'Cancel' : 'Back'}
        </Button>
        {step < 2 ? (
          <Button
            disabled={
              !release ||
              busy ||
              (step === 1 &&
                (!configReady ||
                  mode === 'managed' ||
                  validationError !== null))
            }
            onClick={() => {
              setTemplateError(undefined);
              setStep(step + 1);
            }}
          >
            Continue <ChevronRight />
          </Button>
        ) : (
          <Button
            disabled={
              busy ||
              !release ||
              !configReady ||
              mode === 'managed' ||
              validationError !== null
            }
            onClick={onComplete}
          >
            {busy
              ? rollback
                ? 'Rolling back…'
                : 'Deploying…'
              : rollback
                ? 'Roll back'
                : 'Deploy'}
          </Button>
        )}
      </div>
    </AppDialog>
  );
}

function summarizeConfigChanges(
  beforeMode: ConfigMode,
  afterMode: ConfigMode,
  before: string,
  after: string,
): ConfigChangeSummary {
  const lines = diffLines(before, after);
  return {
    added: lines.filter((line) => line.kind === 'added').length,
    removed: lines.filter((line) => line.kind === 'removed').length,
    sourceChanged: beforeMode !== afterMode,
    unchanged: beforeMode === afterMode && before === after,
  };
}

export function ConfigStatus({
  error,
  summary,
}: {
  readonly error: string | null;
  readonly summary: ConfigChangeSummary;
}): ReactElement {
  if (error) {
    return (
      <div className='flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive'>
        <AlertCircle className='mt-0.5 size-4 shrink-0' />
        <span>{error}</span>
      </div>
    );
  }
  return (
    <div className='flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700'>
      <Check className='size-4 shrink-0' />
      <span>
        {summary.unchanged
          ? 'Valid YAML · No configuration changes'
          : summary.sourceChanged
            ? `Valid YAML · Configuration source changed · ${summary.added} added and ${summary.removed} removed lines`
            : `Valid YAML · ${summary.added} added and ${summary.removed} removed lines`}
      </span>
    </div>
  );
}

export function ConfigEditorFallback(): ReactElement {
  return (
    <div
      className='h-[360px] animate-pulse bg-muted/30'
      aria-label='Loading editor'
    />
  );
}

function validateConfigDocument(content: string): string | null {
  try {
    const value: unknown = content.trim() === '' ? {} : parseYaml(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return 'The YAML root must be an object.';
    }
    return null;
  } catch (error) {
    return `Invalid config.yml: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function diffLines(before: string, after: string): readonly DiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  if (left.length * right.length > 250_000) {
    return diffLinesByPosition(left, right);
  }
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        left[i] === right[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      result.push({
        id: String(result.length),
        kind: 'unchanged',
        value: left[i],
      });
      i += 1;
      j += 1;
    } else if (
      j < right.length &&
      (i === left.length || lengths[i][j + 1] >= lengths[i + 1][j])
    ) {
      result.push({
        id: String(result.length),
        kind: 'added',
        value: right[j],
      });
      j += 1;
    } else {
      result.push({
        id: String(result.length),
        kind: 'removed',
        value: left[i],
      });
      i += 1;
    }
  }
  return result;
}

function diffLinesByPosition(
  left: readonly string[],
  right: readonly string[],
): readonly DiffLine[] {
  const result: DiffLine[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === right[index]) {
      result.push({
        id: String(result.length),
        kind: 'unchanged',
        value: left[index] ?? '',
      });
      continue;
    }
    if (left[index] !== undefined) {
      result.push({
        id: String(result.length),
        kind: 'removed',
        value: left[index],
      });
    }
    if (right[index] !== undefined) {
      result.push({
        id: String(result.length),
        kind: 'added',
        value: right[index],
      });
    }
  }
  return result;
}

export function ConfigModePicker({
  value,
  onChange,
}: {
  readonly value: ConfigMode;
  readonly onChange: (mode: ConfigMode) => void;
}): ReactElement {
  const selected = CONFIG_MODES.find((item) => item.value === value);
  return (
    <div>
      <div className='grid gap-2 sm:grid-cols-3'>
        {CONFIG_MODES.map((item) => (
          <Button
            className={`relative h-11 justify-start px-3 ${value === item.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
            disabled={item.disabled}
            key={item.value}
            onClick={() => onChange(item.value)}
            variant='outline'
          >
            <span className='text-muted-foreground [&_svg]:size-4'>
              {item.icon}
            </span>
            <span>{item.title}</span>
            {item.disabled ? <Badge className='text-[9px]'>Soon</Badge> : null}
            {value === item.value ? (
              <Check className='absolute right-3 size-3.5 text-primary' />
            ) : null}
          </Button>
        ))}
      </div>
      <p className='mt-2 text-xs text-muted-foreground'>
        {selected?.description}
      </p>
    </div>
  );
}

export function DeploymentSteps({
  current,
  rollback,
}: {
  readonly current: number;
  readonly rollback: boolean;
}): ReactElement {
  const steps = rollback
    ? [
        { index: 1, label: 'Configuration' },
        { index: 2, label: 'Review' },
      ]
    : [
        { index: 0, label: 'Release' },
        { index: 1, label: 'Configuration' },
        { index: 2, label: 'Review' },
      ];
  return (
    <ol className='mb-6 flex items-center' aria-label='Deployment progress'>
      {steps.map((item, position) => {
        const active = item.index === current;
        const complete = item.index < current;
        return (
          <li className='contents' key={item.label}>
            {position > 0 ? (
              <span
                className={`mx-3 h-px min-w-6 flex-1 ${complete || active ? 'bg-primary/50' : 'bg-border'}`}
              />
            ) : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full border text-xs ${active ? 'border-primary bg-primary text-primary-foreground' : complete ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-background'}`}
              >
                {complete ? <Check className='size-3.5' /> : position + 1}
              </span>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
