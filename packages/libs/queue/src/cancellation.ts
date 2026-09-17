import { UnrecoverableError } from 'bullmq';

/** User cancellation is distinct from the Worker's shutdown signal. */
export class QueueCancellation {
  private readonly active: Map<string, AbortController> = new Map();

  cancelJob(jobId: string, reason?: string): boolean {
    const controller = this.active.get(jobId);
    if (!controller) return false;
    controller.abort(reason ?? 'Queue job cancelled');
    return true;
  }

  cancelAllJobs(reason?: string): void {
    for (const jobId of this.active.keys()) this.cancelJob(jobId, reason);
  }

  async run(
    jobId: string,
    signal: AbortSignal,
    dispatch: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (this.active.has(jobId))
      throw new Error('Queue job already has a local active dispatch');
    const controller = new AbortController();
    this.active.set(jobId, controller);
    try {
      try {
        await dispatch(AbortSignal.any([signal, controller.signal]));
      } catch (error) {
        if (controller.signal.aborted) {
          const cancelled = new UnrecoverableError(
            String(controller.signal.reason),
          );
          cancelled.cause = error;
          throw cancelled;
        }
        throw error;
      }
      if (controller.signal.aborted)
        throw new UnrecoverableError(String(controller.signal.reason));
    } finally {
      this.active.delete(jobId);
    }
  }
}
