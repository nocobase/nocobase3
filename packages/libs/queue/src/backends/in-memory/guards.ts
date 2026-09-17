import type { JobJson, ParentKeyOpts } from 'bullmq';

/** Empty parent scaffolding from ordinary Job.create is not a flow. */
export function assertSupportedJob(job: JobJson, parent?: ParentKeyOpts): void {
  if (
    ('repeat' in job.opts && job.opts.repeat !== undefined) ||
    job.repeatJobKey !== undefined
  ) {
    throw new Error('Unsupported in-memory queue operation: repeat');
  }
  if (
    job.opts.parent !== undefined ||
    job.parent !== undefined ||
    job.parentKey ||
    parent?.parentKey ||
    parent?.parentDependenciesKey ||
    parent?.addToWaitingChildren
  ) {
    throw new Error('Unsupported in-memory queue operation: parent');
  }
  if (
    job.opts.deduplication !== undefined ||
    ('debounce' in job.opts && job.opts.debounce !== undefined) ||
    job.deduplicationId !== undefined ||
    job.debounceId !== undefined
  ) {
    throw new Error('Unsupported in-memory queue operation: deduplication');
  }
}
