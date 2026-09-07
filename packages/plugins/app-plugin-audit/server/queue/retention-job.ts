import type { DatabaseManager } from '@nocobase/db';
import { Job, type JobOptions } from '@nocobase/queue';
import { AuditError } from '../errors.js';
import type {
  AuditRetentionPlan,
  AuditRetentionService,
} from '../retention-service.js';

export interface AuditRetentionJobPayload extends AuditRetentionPlan {
  readonly binding: string;
}
export interface AuditRetentionJobDependencies {
  readonly database?: DatabaseManager;
}
// This is an App-owned dependency adapter, not job completion or deduplication state.
// Every worker process must install its own trusted bindings during provider startup.
const bindings: WeakMap<
  DatabaseManager,
  Map<string, AuditRetentionService>
> = new WeakMap();

export function bindRetentionJob(
  database: DatabaseManager,
  key: string,
  service: AuditRetentionService,
): () => void {
  const entries =
    bindings.get(database) ?? new Map<string, AuditRetentionService>();
  if (entries.has(key)) throw new AuditError('AUDIT_NOT_READY');
  entries.set(key, service);
  bindings.set(database, entries);
  return (): void => {
    if (entries.get(key) === service) entries.delete(key);
    if (!entries.size) bindings.delete(database);
  };
}

/** The normal host job factory supplies database and logger; payload carries only a trusted binding and fixed scheduling policy/time. */
export default class AuditRetentionJob extends Job<AuditRetentionJobPayload> {
  static options: JobOptions = {
    name: '@nocobase/app-plugin-audit/retention',
    queue: 'default',
  };
  constructor(private readonly dependencies: AuditRetentionJobDependencies) {
    super();
  }
  async execute(): Promise<void> {
    const payload: unknown = this.payload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      Object.keys(payload).length !== 3 ||
      !('binding' in payload) ||
      typeof payload.binding !== 'string' ||
      payload.binding.length > 256 ||
      !('referenceTime' in payload) ||
      typeof payload.referenceTime !== 'string' ||
      !('expectedRevision' in payload) ||
      !Number.isSafeInteger(payload.expectedRevision)
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    const service = this.dependencies.database
      ? bindings.get(this.dependencies.database)?.get(payload.binding)
      : undefined;
    if (!service || !this.dependencies.database)
      throw new AuditError('AUDIT_NOT_READY');
    service.assertJobDatabase(this.dependencies.database);
    await service.run({
      referenceTime: payload.referenceTime,
      expectedRevision: Number(payload.expectedRevision),
    });
  }
}
