import { AsyncLocalStorage } from 'node:async_hooks';
import { sanitizeLog, type JournalEntry } from '@nocobase/logging';

export type DeploymentLogListener = (entry: JournalEntry) => void;
interface DeploymentLogContext {
  listener: DeploymentLogListener;
  sequence: number;
  phase: string;
  started: number;
  appId: string;
  deploymentId: string;
}
const context = new AsyncLocalStorage<DeploymentLogContext>();
export async function withDeploymentLog<T>(
  listener: DeploymentLogListener | undefined,
  appId: string,
  deploymentId: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!listener) return work();
  return context.run(
    {
      listener,
      sequence: 0,
      phase: 'resolving',
      started: Date.now(),
      appId,
      deploymentId,
    },
    work,
  );
}
export function deploymentLog(
  phase: string,
  msg: string,
  details: Record<string, unknown> = {},
): void {
  const value = context.getStore();
  if (!value) return;
  value.phase = phase;
  value.listener(
    sanitizeLog({
      sequence: ++value.sequence,
      time: new Date().toISOString(),
      level: details.err ? 'error' : 'info',
      appId: value.appId,
      deploymentId: value.deploymentId,
      phase,
      msg,
      elapsedMs: Date.now() - value.started,
      ...details,
    }) as JournalEntry,
  );
}
export function deploymentFailure(error: unknown): void {
  deploymentLog(context.getStore()?.phase ?? 'starting', 'Deployment failed', {
    err: sanitizeLog(error),
  });
}
