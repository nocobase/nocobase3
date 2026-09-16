/**
 * Turns "a deployment failed" into "a deployment failed here, after these steps succeeded".
 *
 * A failed deployment reaches the operator as one string: the Host's error message crosses the IPC boundary
 * serialised (`management/ipc.ts`), Hub stores it in `hubAppDeployments.error`, and the console renders it. That
 * string is therefore the entire diagnosis, and today it is whatever the deepest call happened to throw — a bare
 * `Cannot find package 'hono'` with nothing saying whether the artifact was even extracted.
 *
 * The phases are already timed for the success log; this records them as they complete so the same information is
 * available when the next step throws. Adding it to the message rather than to a new field is deliberate: the
 * message already flows to the operator, to the API and to a CI job reading `publish --wait`, and none of those
 * paths have to change.
 *
 * Only phase names, durations and the underlying error's own message are included. Raw subprocess output is never
 * folded in: an install prints registry URLs and auth traces, and this string is shown wherever a deployment is.
 */

export interface CompletedPhase {
  readonly name: string;
  readonly durationMs: number;
}

/** Records phases as a deployment step completes them, and decorates whatever the next step throws. */
export class DeploymentPhases {
  private readonly completed: CompletedPhase[] = [];

  /** Marks a phase as finished. Call it where the duration is already being computed. */
  public complete(name: string, durationMs: number): void {
    this.completed.push({ name, durationMs });
  }

  public get phases(): readonly CompletedPhase[] {
    return this.completed;
  }

  /**
   * Builds the error to throw for a failure in `failedPhase`, carrying the phases that had already succeeded.
   *
   * It returns rather than throws so the call site reads `throw phases.failure(...)`: a method that only ever
   * throws reads as ordinary control flow to a reader and, more practically, does not tell the compiler that the
   * branch ends.
   *
   * The original error is kept as `cause` so a caller that wants the stack still has it; only the message is
   * rewritten, because the message is the part that survives the IPC hop.
   */
  public failure(failedPhase: string, cause: unknown): DeploymentPhaseError {
    return new DeploymentPhaseError(failedPhase, this.completed, cause);
  }
}

export class DeploymentPhaseError extends Error {
  public readonly code = 'DEPLOYMENT_PHASE_FAILED' as const;
  public readonly failedPhase: string;
  public readonly completedPhases: readonly CompletedPhase[];

  constructor(
    failedPhase: string,
    completedPhases: readonly CompletedPhase[],
    cause: unknown,
  ) {
    super(formatPhaseFailure(failedPhase, completedPhases, cause), { cause });
    this.name = 'DeploymentPhaseError';
    this.failedPhase = failedPhase;
    this.completedPhases = completedPhases;
  }
}

/** `Deployment failed during extract (download 1.2s ok, ...): <cause>` */
export function formatPhaseFailure(
  failedPhase: string,
  completedPhases: readonly CompletedPhase[],
  cause: unknown,
): string {
  const reason = causeMessage(cause);
  const progress =
    completedPhases.length > 0
      ? ` after ${completedPhases
          .map((phase) => `${phase.name} ${formatDuration(phase.durationMs)}`)
          .join(', ')}`
      : '';

  return `Deployment failed during ${failedPhase}${progress}: ${reason}`;
}

/**
 * Keeps an already-decorated message intact.
 *
 * A phase can fail inside another phase's call stack; decorating twice would produce
 * "failed during activation ...: Deployment failed during extract ...".
 */
function causeMessage(cause: unknown): string {
  if (cause instanceof DeploymentPhaseError) {
    return cause.message;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function formatDuration(durationMs: number): string {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)}s`
    : `${durationMs}ms`;
}
