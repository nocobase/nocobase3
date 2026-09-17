export class QueueCancellation {
  cancelJob(_jobId: string, _reason?: string): boolean {
    throw new Error('Queue cancellation is not implemented');
  }
  cancelAllJobs(_reason?: string): void {
    throw new Error('Queue cancellation is not implemented');
  }
  async run(
    _jobId: string,
    _signal: AbortSignal,
    _dispatch: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    throw new Error('Queue cancellation is not implemented');
  }
}
