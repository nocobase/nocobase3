import type {
  HeartbeatService,
  HeartbeatState,
  HeartbeatStatus,
} from '../tokens.js';

export class DefaultHeartbeatService implements HeartbeatService {
  private status: HeartbeatStatus = 'stopped';
  private startedAt: string | undefined;

  public start(): void {
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
