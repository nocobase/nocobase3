import { ux } from '@oclif/core';

interface ProgressAction {
  status: string | undefined;
  start(action: string, status?: string): void;
  stop(message?: string): void;
}

/** Reports visible long-running command stages while keeping final command output machine-readable. */
export class CommandProgress {
  private readonly action: string;
  private current = 0;
  private readonly enabled: boolean;
  private readonly output: ProgressAction;
  private running = false;
  private readonly total: number;

  public constructor(
    action: string,
    total: number,
    enabled: boolean = true,
    output: ProgressAction = ux.action,
  ) {
    this.action = action;
    this.total = total;
    this.enabled = enabled;
    this.output = output;
  }

  public report(message: string): void {
    if (!this.enabled) return;
    this.current += 1;
    const status = `[${this.current}/${this.total}] ${message}`;
    if (!this.running) {
      this.output.start(this.action, status);
      this.running = true;
      return;
    }
    this.output.status = status;
  }

  public stop(message: string = 'done'): void {
    if (!this.running) return;
    this.output.stop(message);
    this.running = false;
  }
}
