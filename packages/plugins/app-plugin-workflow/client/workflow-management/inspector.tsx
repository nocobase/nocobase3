import { useEffect, useState, type ReactElement } from 'react';
import type { Translator } from '@nocobase/i18n';
import { useTranslation } from '@nocobase/i18n/client';
import { WORKFLOW_NS } from '../namespace.js';
import { workflowApi } from './data.js';
import type { WorkflowNodeRunPayload, WorkflowNodeRunRecord } from './types.js';
import { Badge } from './ui/badge.js';

export interface WorkflowInspectorProps {
  nodeKey: string | null;
  attempts: readonly WorkflowNodeRunRecord[];
  selectedAttempt?: string | null;
  onSelectAttempt?: (id: string) => void;
}
export function WorkflowInspector({
  nodeKey,
  attempts,
  selectedAttempt,
  onSelectAttempt,
}: WorkflowInspectorProps): ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
  if (!nodeKey)
    return (
      <aside aria-label={t('inspector.label')}>
        <h2>{t('inspector.overview')}</h2>
        <p>{t('inspector.selectNode')}</p>
      </aside>
    );
  return (
    <aside aria-label={t('inspector.label')}>
      <h2>{nodeKey}</h2>
      <label>
        {t('inspector.attempt')}{' '}
        <select
          value={selectedAttempt ?? attempts.at(-1)?.id ?? ''}
          onChange={(event) => onSelectAttempt?.(event.target.value)}
        >
          {attempts.map((attempt, index) => (
            <option key={attempt.id} value={attempt.id}>
              {index + 1} · {attempt.status}
            </option>
          ))}
        </select>
      </label>
      <ol>
        {attempts.map((attempt) => (
          <li key={attempt.id}>
            #{attempt.id} · {attempt.startedAt} →{' '}
            {attempt.finishedAt ?? t('inspector.stillRunning')}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function displayValue(value: unknown, t: Translator): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  if (typeof value === 'symbol') return value.toString();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return t('inspector.unserializable');
  }
}
function formatClientTime(value: string | null, t: Translator): string {
  if (!value) return t('inspector.stillRunning');
  const date = new Date(value);
  const part = (next: number, width: number = 2): string =>
    String(next).padStart(width, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}.${part(date.getMilliseconds(), 3)}`;
}
function runStatusLabel(status: number, t: Translator): string {
  return status === 1
    ? t('status.succeeded')
    : status === 0
      ? t('status.running')
      : status === -1
        ? t('status.failed')
        : status === -2
          ? t('status.error')
          : t('status.aborted');
}
function runStatusTone(status: number): string {
  return status === 1
    ? 'resolved'
    : status === 0
      ? 'running'
      : status === -1
        ? 'failed'
        : status === -2
          ? 'error'
          : 'aborted';
}
function formatRunDuration(run: WorkflowNodeRunRecord): string {
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  const elapsed = Math.max(0, end - start);
  return elapsed < 1000 ? `${elapsed} ms` : `${(elapsed / 1000).toFixed(1)} s`;
}
function useAnimatedDialogClose(onClose: () => void): {
  closing: boolean;
  close: () => void;
} {
  const [closing, setClosing] = useState(false);
  const close = (): void => {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 160);
  };
  return { closing, close };
}
export interface WorkflowRunResultDialogProps {
  runId: string;
  nodeRun: WorkflowNodeRunRecord;
  nodeTitle?: string;
  nodeDescription?: string | null;
  onClose: () => void;
}
export function WorkflowRunResultDialog({
  runId,
  nodeRun,
  nodeTitle,
  nodeDescription,
  onClose,
}: WorkflowRunResultDialogProps): ReactElement {
  return (
    <WorkflowRunResultDialogContent
      key={`${runId}:${nodeRun.id}`}
      runId={runId}
      nodeRun={nodeRun}
      nodeTitle={nodeTitle}
      nodeDescription={nodeDescription}
      onClose={onClose}
    />
  );
}
function WorkflowRunResultDialogContent({
  runId,
  nodeRun,
  nodeTitle,
  nodeDescription,
  onClose,
}: WorkflowRunResultDialogProps): ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
  const [attemptId, setAttemptId] = useState(nodeRun.id);
  const attemptsKey = `${runId}:${nodeRun.nodeKey}`;
  const [attemptsResult, setAttemptsResult] = useState<{
    key: string;
    value: WorkflowNodeRunRecord[];
  }>(() => ({ key: attemptsKey, value: [nodeRun] }));
  const payloadKey = `${runId}:${attemptId}`;
  const [payloadResult, setPayloadResult] = useState<{
    key: string;
    value: WorkflowNodeRunPayload | null;
    error: string | null;
  }>(() => ({ key: payloadKey, value: null, error: null }));
  const animatedClose = useAnimatedDialogClose(onClose);
  useEffect(() => {
    let active = true;
    void workflowApi.nodeRuns(runId, nodeRun.nodeKey).then(
      (next) => {
        if (active) setAttemptsResult({ key: attemptsKey, value: next });
      },
      () => {
        /* The latest summary remains enough to display the selected run. */
      },
    );
    return () => {
      active = false;
    };
  }, [attemptsKey, nodeRun.nodeKey, runId]);
  useEffect(() => {
    let active = true;
    void workflowApi.payload(runId, attemptId).then(
      (next) => {
        if (active)
          setPayloadResult({ key: payloadKey, value: next, error: null });
      },
      (cause: unknown) => {
        if (active)
          setPayloadResult({
            key: payloadKey,
            value: null,
            error: cause instanceof Error ? cause.message : String(cause),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [attemptId, payloadKey, runId]);
  const attempts =
    attemptsResult.key === attemptsKey ? attemptsResult.value : [nodeRun];
  const payload = payloadResult.key === payloadKey ? payloadResult.value : null;
  const error = payloadResult.key === payloadKey ? payloadResult.error : null;
  const current =
    attempts.find((attempt) => attempt.id === attemptId) ?? nodeRun;
  return (
    <div
      className={
        animatedClose.closing
          ? 'workflow-result-backdrop closing'
          : 'workflow-result-backdrop'
      }
      role='presentation'
      onMouseDown={animatedClose.close}
    >
      <section
        className='workflow-result-dialog workflow-node-result-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='workflow-result-title'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id='workflow-result-title'>{nodeTitle ?? current.nodeKey}</h2>
            <div className='workflow-node-result-meta'>
              <Badge
                className={`workflow-run-status-tag ${runStatusTone(current.status)}`}
              >
                {runStatusLabel(current.status, t)}
              </Badge>
              <span>
                {t('common.duration', { duration: formatRunDuration(current) })}
              </span>
            </div>
          </div>
          <button
            type='button'
            aria-label={t('inspector.closeResult')}
            onClick={animatedClose.close}
          >
            ×
          </button>
        </header>
        {attempts.length > 1 ? (
          <label>
            {t('inspector.attempt')}{' '}
            <select
              value={attemptId}
              onChange={(event) => setAttemptId(event.target.value)}
            >
              {attempts.map((attempt, index) => (
                <option key={attempt.id} value={attempt.id}>
                  {index + 1} · {runStatusLabel(attempt.status, t)} ·{' '}
                  {formatClientTime(attempt.startedAt, t)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {nodeDescription?.trim() ? (
          <details className='workflow-node-description-disclosure'>
            <summary>{t('common.description')}</summary>
            <p>{nodeDescription}</p>
          </details>
        ) : null}
        {error ? (
          <p role='alert'>{error}</p>
        ) : payload ? (
          <div className='workflow-result-content'>
            {payload.truncated ? (
              <p role='status'>{t('inspector.payloadTruncated')}</p>
            ) : null}
            {payload.error ? (
              <>
                <h3>{t('status.error')}</h3>
                <pre>{payload.error}</pre>
              </>
            ) : (
              <>
                <h3>{t('inspector.result')}</h3>
                <pre>{displayValue(payload.result, t)}</pre>
              </>
            )}
            {payload.log?.trim() ? (
              <>
                <h3>{t('inspector.log')}</h3>
                <pre>{payload.log}</pre>
              </>
            ) : null}
          </div>
        ) : (
          <p>{t('inspector.loadingResult')}</p>
        )}
      </section>
    </div>
  );
}

export interface WorkflowInputDialogProps {
  input: unknown;
  onClose: () => void;
}
export function WorkflowInputDialog({
  input,
  onClose,
}: WorkflowInputDialogProps): ReactElement {
  const { t } = useTranslation(WORKFLOW_NS);
  const animatedClose = useAnimatedDialogClose(onClose);
  return (
    <div
      className={
        animatedClose.closing
          ? 'workflow-result-backdrop closing'
          : 'workflow-result-backdrop'
      }
      role='presentation'
      onMouseDown={animatedClose.close}
    >
      <section
        className='workflow-result-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='workflow-input-title'
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id='workflow-input-title'>{t('inspector.inputTitle')}</h2>
            <p>{t('inspector.inputDescription')}</p>
          </div>
          <button
            type='button'
            aria-label={t('inspector.closeInput')}
            onClick={animatedClose.close}
          >
            ×
          </button>
        </header>
        <div className='workflow-result-content'>
          <h3>{t('inspector.input')}</h3>
          <pre>{displayValue(input, t)}</pre>
        </div>
      </section>
    </div>
  );
}
