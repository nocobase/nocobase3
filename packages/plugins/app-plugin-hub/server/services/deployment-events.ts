import type { HubDeploymentEvent, HubDeploymentRecord } from '../tokens.js';

// Classify the terminal error without copying its raw contents into the journal.
export function deploymentFailureCode(error: string): string {
  if (/interrupted by a Hub restart/i.test(error)) return 'HUB_RESTARTED';
  if (/ARTIFACT_VERSION_MISMATCH|version mismatch/i.test(error))
    return 'ARTIFACT_VERSION_MISMATCH';
  if (
    /NODE_MODULE_VERSION|ABI|build target|incompatible|platform mismatch/i.test(
      error,
    )
  )
    return 'INCOMPATIBLE_BUILD';
  if (/ECONNREFUSED/.test(error)) return 'CONNECTION_REFUSED';
  if (/ETIMEDOUT|timed? ?out|timeout/i.test(error)) return 'TIMEOUT';
  if (/MODULE_NOT_FOUND|Cannot find (module|package)/i.test(error))
    return 'MODULE_NOT_FOUND';
  if (/EACCES|permission denied/i.test(error)) return 'PERMISSION_DENIED';
  if (/ENOENT/.test(error)) return 'FILE_NOT_FOUND';
  if (/config|yaml/i.test(error)) return 'INVALID_CONFIG';
  return 'DEPLOYMENT_FAILED';
}

export function appendDeploymentEvent(
  events: readonly HubDeploymentEvent[],
  state: Pick<HubDeploymentRecord, 'phase' | 'status'>,
  error?: string | null,
): readonly HubDeploymentEvent[] {
  const previous = events.at(-1);
  if (previous?.phase === state.phase && previous.status === state.status)
    return events;
  const event: HubDeploymentEvent = {
    sequence: (previous?.sequence ?? 0) + 1,
    at: new Date().toISOString(),
    phase: state.phase,
    status: state.status,
    ...(error
      ? {
          code: deploymentFailureCode(error),
          failedPhase:
            [...events].reverse().find((event) => event.failedPhase)
              ?.failedPhase ?? previous?.phase,
        }
      : {}),
  };
  // Bound each deployment to 64 small, structured events; terminal state is always retained.
  return [...events, event].slice(-64);
}
