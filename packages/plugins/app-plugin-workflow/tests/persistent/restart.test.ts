import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { observeQueue, persistentOptions } from './backend.js';
import { businessQueue } from './application.js';
import { WORKFLOW_QUEUE_NAME } from '../../server/queue.js';

const childFile = fileURLToPath(new URL('./process.ts', import.meta.url));

async function phase(
  name: string,
  root: string,
  namespace: string,
  entry: string = childFile,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', entry, name, root, namespace],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${name} failed (code=${code}, signal=${signal}):\n${output}`,
          ),
        );
    });
  });
}

it('restarts a queued Workflow and separately demonstrates independent business-consumer idempotency', async () => {
  const namespace = `workflow-${randomUUID()}`;
  const options = persistentOptions(namespace);
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-persistent-'));
  try {
    // phase() waits for process exit, not merely a "ready" message.
    await phase('stage-workflow', root, namespace);
    await phase('restart-workflow', root, namespace);
    await phase('fail-effect', root, namespace);
    await phase('retry-effect', root, namespace);
    const first = JSON.parse(
      await readFile(path.join(root, 'effect-first.json'), 'utf8'),
    ) as { jobId: string };
    const retry = JSON.parse(
      await readFile(path.join(root, 'effect-retry.json'), 'utf8'),
    ) as { jobId: string; attempts: unknown[]; effects: unknown[] };
    expect(retry.jobId).toBe(first.jobId);
    expect(retry.attempts).toHaveLength(2);
    expect(retry.effects).toHaveLength(1);
    console.info(
      `PASS ${String(options.queueBackend)}: delayed Workflow survived process exit, original artifact/input/output resolved; independent businessQueue job ${retry.jobId} redelivered in two processes with one durable business effect`,
    );
  } finally {
    try {
      for (const queue of [WORKFLOW_QUEUE_NAME, businessQueue]) {
        const observer = observeQueue(options, queue);
        try {
          await observer.obliterate({ force: true });
        } finally {
          await observer.close();
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}, 250_000);

it('redelivers the actual Workflow handler after post-effect acknowledgement failure without repeating its instruction', async () => {
  const namespace = `workflow-engine-${randomUUID()}`;
  const options = persistentOptions(namespace);
  const root = await mkdtemp(
    path.join(tmpdir(), 'workflow-engine-redelivery-'),
  );
  const entry = fileURLToPath(new URL('./engine-process.ts', import.meta.url));
  try {
    await phase('fail-engine-ack', root, namespace, entry);
    await phase('redeliver-engine', root, namespace, entry);
    type Proof = {
      jobId: string;
      pid: number;
      run: { id: string | number };
      business: { attempts: unknown[]; effects: unknown[] };
    };
    const first = JSON.parse(
      await readFile(path.join(root, 'engine-first.json'), 'utf8'),
    ) as Proof;
    const retry = JSON.parse(
      await readFile(path.join(root, 'engine-retry.json'), 'utf8'),
    ) as Proof;
    const deliveries = (
      await readFile(path.join(root, 'engine-deliveries.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { pid: number; task: unknown });
    expect(deliveries).toEqual([
      expect.objectContaining({
        pid: first.pid,
        task: { executionId: first.run.id },
      }),
      expect.objectContaining({
        pid: retry.pid,
        task: { executionId: first.run.id },
      }),
    ]);
    expect(retry.pid).not.toBe(first.pid);
    expect(retry.jobId).toBe(first.jobId);
    expect(retry.run).toEqual(first.run);
    expect(retry.business.attempts).toHaveLength(1);
    expect(retry.business.effects).toHaveLength(1);
    console.info(
      `PASS ${String(options.queueBackend)}: actual Workflow job ${retry.jobId}, two real handler deliveries in different processes, unchanged terminal run/node, one instruction invocation and one durable business effect`,
    );
  } finally {
    const observer = observeQueue(options, WORKFLOW_QUEUE_NAME);
    try {
      await observer.obliterate({ force: true });
    } finally {
      await observer.close();
      await rm(root, { recursive: true, force: true });
    }
  }
}, 130_000);
