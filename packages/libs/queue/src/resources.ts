/** Memoizes both success and failure: retrying a failed initialization requires a new service. */
export class QueueResourceCache {
  private readonly pending: Map<string, Promise<void>> = new Map();

  initialize(name: string, create: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(name);
    if (previous) return previous;
    const pending = Promise.resolve().then(create);
    this.pending.set(name, pending);
    return pending;
  }

  async settle(): Promise<void> {
    await Promise.allSettled(this.pending.values());
  }
}
