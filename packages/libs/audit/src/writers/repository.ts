import type { AuditEvent, AuditWriter } from '../types.js';

export interface RepositoryAuditWriterOptions<TValues> {
  readonly repository: {
    createOne(options: { values: TValues }): Promise<unknown>;
  };
  readonly toValues: (event: AuditEvent) => TValues;
}

/** The caller owns the repository, its schema, and the transaction boundary. */
export function createRepositoryAuditWriter<TValues>(
  options: RepositoryAuditWriterOptions<TValues>,
): AuditWriter {
  return {
    async write(event): Promise<void> {
      await options.repository.createOne({ values: options.toValues(event) });
    },
  };
}
