export interface MemoryLock {
  token: string;
  expires: number;
}

/** Shared queue locks/notifications; each backend owns its own blocking waits. */
export class MemoryWorkerState {
  readonly locks: Map<string, MemoryLock> = new Map();
  readonly listeners: Set<() => void> = new Set();
  readonly stalled: Set<string> = new Set();
  nextStalledCheck: number = 0;

  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  owns(id: string, token: string, now: number = Date.now()): boolean {
    const lock = this.locks.get(id);
    return lock !== undefined && lock.token === token && lock.expires > now;
  }
}

export class MemoryWaiter {
  private disconnected: boolean = false;
  private readonly cancellations: Set<() => void> = new Set();

  constructor(private readonly state: MemoryWorkerState) {}

  wait(
    seconds: number,
    available: () => string | undefined,
  ): Promise<{ member: string; score: number } | null> {
    if (this.disconnected) return Promise.resolve(null);
    const ready = available();
    if (ready !== undefined)
      return Promise.resolve({ member: ready, score: 0 });
    return new Promise((resolve) => {
      const finish = (member?: string): void => {
        clearTimeout(timer);
        this.state.listeners.delete(wake);
        this.cancellations.delete(cancel);
        resolve(member === undefined ? null : { member, score: 0 });
      };
      const wake = (): void => {
        const member = available();
        if (member !== undefined) finish(member);
      };
      const cancel = (): void => finish();
      const timer = setTimeout(
        cancel,
        Math.min(2147483647, Math.max(1, seconds * 1000)),
      );
      this.state.listeners.add(wake);
      this.cancellations.add(cancel);
      wake();
    });
  }

  disconnect(): void {
    this.disconnected = true;
    for (const cancel of [...this.cancellations]) cancel();
  }

  reconnect(): void {
    this.disconnected = false;
  }
}
