import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { databaseManagerToken } from '@nocobase/db';
import { queueServiceToken } from '@nocobase/app-server/queue';
import type { ConsumeHandler } from '@nocobase/queue';
import {
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_TASK_JOB_NAME,
} from '../../server/queue.js';
import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../../server/engine/constants.js';
import { asId, asIdFilter, hydrateNodeRun } from '../../server/engine/utils.js';
import type {
  WorkflowRun,
  WorkflowNodeRun,
} from '../../server/engine/types.js';
import { findRun, readRun, testStore, waitFor } from '../helpers.js';
import {
  createAcceptanceApplication,
  emitRevision,
  enableRevision,
  eventKey,
  input,
  triggerWorkflow,
} from './application.js';
import { observeQueue, persistentOptions } from './backend.js';
import { DurableBusinessEffect } from './business.js';
import { businessInstructionType } from './instruction.js';

type Proof = {
  jobId: string;
  pid: number;
  run: WorkflowRun;
  nodes: WorkflowNodeRun[];
  business: ReturnType<DurableBusinessEffect['snapshot']>;
};
const [phase, root, namespace] = process.argv.slice(2);
assert(root && namespace, 'Expected phase, application root and namespace');
assert(phase === 'fail-engine-ack' || phase === 'redeliver-engine');
const firstAttempt = phase === 'fail-engine-ack';
const options = {
  ...persistentOptions(namespace),
  backoff: { type: 'fixed', delay: 3_600_000 },
};
const app = await createAcceptanceApplication(
  root,
  options,
  firstAttempt ? 'initialize' : 'restart',
);
const observer = observeQueue(options, WORKFLOW_QUEUE_NAME);
let started = false;
try {
  // Resolve only the real QueueService before WorkflowProvider boot registers its handler.
  // This wrapper calls that exact handler and faults OUTSIDE the engine's error handling.
  app.registerProviders();
  const queue = app.container.resolve(queueServiceToken);
  const consumer = queue.consumer(WORKFLOW_QUEUE_NAME);
  const consume = consumer.consume.bind(consumer);
  let deliveries = 0;
  consumer.consume = <T>(handler: ConsumeHandler<T>) =>
    consume<T>(async (channel, task, signal) => {
      assert.equal(channel, WORKFLOW_TASK_JOB_NAME);
      deliveries += 1;
      await handler(channel, task, signal);
      await appendFile(
        path.join(root, 'engine-deliveries.jsonl'),
        JSON.stringify({
          pid: process.pid,
          channel,
          task,
        }) + '\n',
      );
      if (firstAttempt) {
        throw new Error(
          'Injected delivery failure after real Workflow dispatch and business commit, before queue acknowledgement',
        );
      }
    });

  let jobId: string;
  let previous: Proof | undefined;
  if (firstAttempt) {
    const hash = await emitRevision(
      root,
      'business-effect',
      businessInstructionType,
    );
    const producer = queue.producer(WORKFLOW_QUEUE_NAME);
    const publish = producer.publish.bind(producer);
    let publishedId: string | undefined;
    let publishes = 0;
    producer.publish = async (channel, message, publishOptions) => {
      publishes += 1;
      const receipt = await publish(channel, message, publishOptions);
      publishedId = receipt.jobId;
      return receipt;
    };
    await app.start();
    started = true;
    await enableRevision(app, hash);
    await triggerWorkflow(app);
    assert.equal(publishes, 1);
    assert(publishedId);
    jobId = publishedId;
    await waitFor(
      async () => (await observer.getJobState(jobId)) === 'delayed',
      30_000,
    );
    assert.equal((await observer.getJob(jobId))!.attemptsMade, 1);
  } else {
    previous = JSON.parse(
      await readFile(path.join(root, 'engine-first.json'), 'utf8'),
    ) as Proof;
    assert.notEqual(previous.pid, process.pid);
    jobId = previous.jobId;
    assert.equal(await observer.getJobState(jobId), 'delayed');
    assert.equal((await observer.getJob(jobId))!.attemptsMade, 1);
    await (await observer.getJob(jobId))!.promote();
    assert.equal(await observer.getJobState(jobId), 'waiting');
    // No trigger/enqueue/recovery call: only the existing backend job can invoke the handler.
    await app.start();
    started = true;
    await waitFor(
      async () => (await observer.getJobState(jobId)) === 'completed',
      30_000,
    );
    assert.equal((await observer.getJob(jobId))!.attemptsMade, 2);
  }
  assert.equal(
    deliveries,
    1,
    'The real Workflow queue handler must run in each process',
  );
  const database = app.container.resolve(databaseManagerToken);
  const run = await readRun(
    database,
    asId((await findRun(database, eventKey)).id),
  );
  const nodes = (
    await testStore(database).nodeRuns.findMany({
      filter: { workflowRunId: asIdFilter(run.id) },
      sort: (sort) => sort.field('id').asc(),
    })
  ).map(hydrateNodeRun);
  assert.equal(run.status, EXECUTION_STATUS.RESOLVED);
  assert(run.finishedAt);
  assert.deepEqual(run.input, input);
  assert.deepEqual(run.output, {
    businessKey: input.businessKey,
    committed: true,
    input,
  });
  assert.equal(await testStore(database).runs.count(), 1);
  assert.equal(await testStore(database).nodeRuns.count(), 1);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]!.status, NODE_RUN_STATUS.RESOLVED);
  assert(nodes[0]!.finishedAt);
  assert.equal(nodes[0]!.error, null);
  assert.deepEqual(nodes[0]!.result, run.output);
  const business = new DurableBusinessEffect(
    path.join(root, 'business.sqlite'),
  );
  let snapshot: ReturnType<DurableBusinessEffect['snapshot']>;
  try {
    const rows = business.snapshot();
    // node:sqlite returns null-prototype rows; proofs cross the JSON/process boundary.
    snapshot = {
      attempts: rows.attempts.map((row) => ({ ...row })),
      effects: rows.effects.map((row) => ({ ...row })),
    };
  } finally {
    business.close();
  }
  assert.equal(snapshot.effects.length, 1);
  assert.equal(
    snapshot.attempts.length,
    1,
    'A terminal Workflow must not execute its instruction again',
  );
  assert.equal(snapshot.effects[0]!.business_key, input.businessKey);
  assert.equal(snapshot.effects[0]!.payload, JSON.stringify(input));
  assert.equal(snapshot.effects[0]!.process_id, previous?.pid ?? process.pid);
  if (previous) {
    assert.deepEqual(
      run,
      previous.run,
      'Redelivery must not rewrite the terminal run',
    );
    assert.deepEqual(
      nodes,
      previous.nodes,
      'Redelivery must not create or rewrite node runs',
    );
    assert.deepEqual(snapshot, previous.business);
  }
  assert.deepEqual(
    await observer.getJobCounts(
      'waiting',
      'delayed',
      'active',
      'completed',
      'failed',
    ),
    {
      waiting: 0,
      delayed: firstAttempt ? 1 : 0,
      active: 0,
      completed: firstAttempt ? 0 : 1,
      failed: 0,
    },
  );
  const proof: Proof = {
    jobId,
    pid: process.pid,
    run,
    nodes,
    business: snapshot,
  };
  await writeFile(
    path.join(root, firstAttempt ? 'engine-first.json' : 'engine-retry.json'),
    JSON.stringify(proof),
  );
} finally {
  try {
    if (started) await app.shutdown();
  } finally {
    await observer.close();
  }
}
