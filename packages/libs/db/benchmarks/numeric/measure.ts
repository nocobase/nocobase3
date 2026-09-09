import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import type { Knex } from 'knex';

export interface Scenario {
  name: string;
  api: 'knex' | 'query' | 'repository';
  prepare?: () => Promise<void> | void;
  run: () => Promise<unknown>;
  verify: (result: unknown) => void;
  accuracy?: (result: unknown) => Record<string, number>;
}
export interface Sample {
  ms: number;
  cpuMs: number;
  heapDeltaBytes: number;
  rssDeltaBytes: number;
  immediateDelayMs: number;
  sqlCount: number;
}
export interface Measurement {
  name: string;
  api: Scenario['api'];
  samples: Sample[];
  medianMs: number;
  minMs: number;
  maxMs: number;
  medianCpuMs: number;
  medianImmediateDelayMs: number;
  sqlCount: { min: number; max: number };
  trace: { sql: string; bindingCount: number; executions: number }[];
  resultTypes: Record<string, string>;
  resultPreview: unknown;
  accuracy?: Record<string, number>;
}
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function resultTypes(result: unknown): Record<string, string> {
  let sample = Array.isArray(result) ? result[0] : result;
  if (sample && typeof sample === 'object' && 'records' in sample) {
    const records = sample.records;
    sample = Array.isArray(records) ? records[0] : records;
  }
  if (!sample || typeof sample !== 'object') return { value: typeof sample };
  return Object.fromEntries(
    Object.entries(sample).map(([key, value]) => [
      key,
      value === null ? 'null' : typeof value,
    ]),
  );
}

/** SQL capture/validation are outside timing. Timed runs only increment a counter. */
export async function measure(
  client: Knex,
  scenario: Scenario,
  repeats: number,
  warmups: number,
): Promise<Measurement> {
  const trace = new Map<
    string,
    { sql: string; bindingCount: number; executions: number }
  >();
  const capture = (event: { sql: string; bindings?: unknown[] }) => {
    const key = event.sql;
    const entry = trace.get(key);
    if (entry) entry.executions++;
    else
      trace.set(key, {
        sql: event.sql,
        bindingCount: event.bindings?.length ?? 0,
        executions: 1,
      });
  };
  await scenario.prepare?.();
  client.on('query', capture);
  let example: unknown;
  try {
    example = await scenario.run();
  } finally {
    client.off('query', capture);
  }
  scenario.verify(example);
  for (let i = 0; i < warmups; i++) {
    await scenario.prepare?.();
    scenario.verify(await scenario.run());
  }
  const samples: Sample[] = [];
  for (let i = 0; i < repeats; i++) {
    await scenario.prepare?.();
    await setImmediate();
    let sqlCount = 0;
    const count = () => {
      sqlCount++;
    };
    client.on('query', count);
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const start = performance.now();
    const heartbeat = setImmediate().then(() => performance.now() - start);
    let result: unknown;
    let elapsed: number;
    let usedCpu: NodeJS.CpuUsage;
    try {
      result = await scenario.run();
      elapsed = performance.now() - start;
      usedCpu = process.cpuUsage(cpu);
    } finally {
      client.off('query', count);
    }
    const after = process.memoryUsage();
    const immediateDelayMs = await heartbeat;
    scenario.verify(result);
    samples.push({
      ms: elapsed,
      cpuMs: (usedCpu.user + usedCpu.system) / 1000,
      heapDeltaBytes: after.heapUsed - memory.heapUsed,
      rssDeltaBytes: after.rss - memory.rss,
      immediateDelayMs,
      sqlCount,
    });
  }
  return {
    name: scenario.name,
    api: scenario.api,
    samples,
    medianMs: median(samples.map((s) => s.ms)),
    minMs: Math.min(...samples.map((s) => s.ms)),
    maxMs: Math.max(...samples.map((s) => s.ms)),
    medianCpuMs: median(samples.map((s) => s.cpuMs)),
    medianImmediateDelayMs: median(samples.map((s) => s.immediateDelayMs)),
    sqlCount: {
      min: Math.min(...samples.map((s) => s.sqlCount)),
      max: Math.max(...samples.map((s) => s.sqlCount)),
    },
    trace: [...trace.values()],
    resultTypes: resultTypes(example),
    accuracy: scenario.accuracy?.(example),
    resultPreview: Array.isArray(example)
      ? example[0]
      : example && typeof example === 'object' && 'createdCount' in example
        ? { createdCount: example.createdCount }
        : example,
  };
}
