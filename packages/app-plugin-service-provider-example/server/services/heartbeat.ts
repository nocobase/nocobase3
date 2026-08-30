import type {
  HeartbeatService,
  HeartbeatState,
  HeartbeatStatus,
} from '../tokens.js';

export class DefaultHeartbeatService implements HeartbeatService {
  private status: HeartbeatStatus = 'stopped';
  private startedAt: string | undefined;

  public constructor(private readonly enabled: boolean = true) {}

  public start(): void {
    if (!this.enabled) {
      return;
    }
    this.status = 'running';
    this.startedAt = new Date().toISOString();
  }

  public ready(): void {
    this.status = 'ready';
  }

  public stop(): void {
    this.status = 'stopped';
    this.startedAt = undefined;
  }

  public getState(): HeartbeatState {
    return {
      status: this.status,
      startedAt: this.startedAt,
    };
  }
}
