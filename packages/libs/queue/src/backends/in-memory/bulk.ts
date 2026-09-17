import type { JobJson, ParentKeyOpts } from 'bullmq';
import type { MemoryJobInput } from './store.js';
import { assertSupportedJob } from './guards.js';

export interface MemoryBatchEntry {
  job: JobJson;
  jobId: string;
  parentKeyOpts?: ParentKeyOpts;
}

export interface PreparedMemoryEntry {
  job: JobJson;
  input: MemoryJobInput;
}

export function prepareMemoryBatch(
  entries: MemoryBatchEntry[],
): PreparedMemoryEntry[] {
  return entries.map(({ job, jobId, parentKeyOpts }) => {
    assertSupportedJob(job, parentKeyOpts);
    const snapshot = structuredClone(job);
    const data: unknown = JSON.parse(snapshot.data);
    return {
      job: snapshot,
      input: {
        id: jobId || undefined,
        name: snapshot.name,
        data,
        options: snapshot.opts,
      },
    };
  });
}
