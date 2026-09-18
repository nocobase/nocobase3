import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { databaseManagerToken } from '@nocobase/db';
import { queueServiceToken } from '@nocobase/app-server/queue';
import { WORKFLOW_QUEUE_NAME } from '../../server/queue.js';
import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../../server/engine/constants.js';
import { asId } from '../../server/engine/utils.js';
import {
  findRun,
  listNodeRuns,
  readRun,
  testStore,
  waitFor,
} from '../helpers.js';
import {
  businessKey,
  businessQueue,
  createAcceptanceApplication,
  emitRevision,
  enableRevision,
  eventKey,
  input,
  triggerWorkflow,
  replaceRevision,
} from './application.js';
import {
  observeQueue,
  persistentOptions,
  type QueueObserver,
} from './backend.js';
import { DurableBusinessEffect } from './business.js';

type Stage = {
  jobId: string;
  hash: string;
  newerHash: string;
  workflowId: string;
  runId: string;
  pid: number;
  namespace: string;
};
const [phase, root, namespace] = process.argv.slice(2);
assert(
  root && namespace,
  'Expected phase, temporary application root and queue namespace',
);
assert(
  [
    'stage-workflow',
    'restart-workflow',
    'fail-effect',
    'retry-effect',
  ].includes(phase!),
  'Unknown acceptance phase',
);
const options = persistentOptions(namespace);
const mode =
  phase === 'stage-workflow'
    ? 'initialize'
    : phase === 'restart-workflow'
      ? 'restart'
      : (phase as 'fail-effect' | 'retry-effect');
const app = await createAcceptanceApplication(root, options, mode);
let observer: QueueObserver | undefined;
let started = false;
try {
  if (phase === 'stage-workflow') {
    const hash = await emitRevision(root, 'original');
    app.registerProviders();
    const queue = app.container.resolve(queueServiceToken);
    const producer = queue.producer(WORKFLOW_QUEUE_NAME);
    const publish = producer.publish.bind(producer);
    let jobId: string | undefined;
    // Scheduling barrier only: the real adapter, producer, serialization and backend all run.
    producer.publish = async (channel, message, publishOptions) => {
      const receipt = await publish(channel, message, {
        ...publishOptions,
        delay: 3_600_000,
      });
      jobId = receipt.jobId;
      return receipt;
    };
    await app.start();
    started = true;
    observer = observeQueue(options, WORKFLOW_QUEUE_NAME);
    await enableRevision(app, hash);
    await triggerWorkflow(app);
    assert(jobId, 'Workflow must publish a real queue job');
    await waitFor(
      async () => (await observer!.getJobState(jobId!)) === 'delayed',
      15_000,
    );
    const database = app.container.resolve(databaseManagerToken);
    const run = await readRun(
      database,
      asId((await findRun(database, eventKey)).id),
    );
    assert.equal(run.status, EXECUTION_STATUS.QUEUEING);
    assert.equal(run.hash, hash);
    assert.deepEqual(run.input, input);
    assert.deepEqual(await listNodeRuns(database, run.id), []);
    const newerHash = await replaceRevision(app, root);
    const current = await testStore(database).workflows.findOne({
      filter: { key: run.workflowKey, current: true },
    });
    assert.equal(current?.hash, newerHash);
    const stage: Stage = {
      jobId,
      hash,
      newerHash,
      workflowId: String(run.workflowId),
      runId: String(run.id),
      pid: process.pid,
      namespace,
    };
    await writeFile(path.join(root, 'stage.json'), JSON.stringify(stage));
  } else if (phase === 'restart-workflow') {
    const stage = JSON.parse(
      await readFile(path.join(root, 'stage.json'), 'utf8'),
    ) as Stage;
    assert.notEqual(stage.pid, process.pid);
    assert.equal(stage.namespace, namespace);
    observer = observeQueue(options, WORKFLOW_QUEUE_NAME);
    assert.equal(await observer.getJobState(stage.jobId), 'delayed');
    await (await observer.getJob(stage.jobId))!.promote();
    // The first application has exited. No consumer exists here yet.
    assert.equal(await observer.getJobState(stage.jobId), 'waiting');
    await app.start();
    started = true;
    const database = app.container.resolve(databaseManagerToken);
    await waitFor(
      async () =>
        (await readRun(database, stage.runId)).status ===
        EXECUTION_STATUS.RESOLVED,
      30_000,
    );
    await waitFor(
      async () => (await observer!.getJobState(stage.jobId)) === 'completed',
      15_000,
    );
    const run = await readRun(database, stage.runId);
    assert.equal(String(run.workflowId), stage.workflowId);
    assert.equal(run.hash, stage.hash);
    assert.notEqual(run.hash, stage.newerHash);
    assert.deepEqual(run.input, input);
    assert.deepEqual(run.output, { revision: 'original', input });
    assert(run.finishedAt);
    assert.equal(await testStore(database).runs.count(), 1);
    const nodes = await listNodeRuns(database, run.id);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]!.status, NODE_RUN_STATUS.RESOLVED);
    assert.deepEqual(nodes[0]!.result, run.output);
    const counts = await observer.getJobCounts(
      'waiting',
      'delayed',
      'active',
      'completed',
      'failed',
    );
    assert.deepEqual(counts, {
      waiting: 0,
      delayed: 0,
      active: 0,
      completed: 1,
      failed: 0,
    });
    await writeFile(
      path.join(root, 'restart.json'),
      JSON.stringify({ pid: process.pid, run, counts }),
    );
  } else {
    observer = observeQueue(options, businessQueue);
    let jobId: string;
    if (phase === 'retry-effect') {
      const first = JSON.parse(
        await readFile(path.join(root, 'effect-first.json'), 'utf8'),
      ) as { pid: number; jobId: string };
      assert.notEqual(first.pid, process.pid);
      jobId = first.jobId;
      assert.equal(await observer.getJobState(jobId), 'delayed');
      await (await observer.getJob(jobId))!.promote();
      assert.equal(await observer.getJobState(jobId), 'waiting');
      await app.start();
      started = true;
      await waitFor(
        async () => (await observer!.getJobState(jobId)) === 'completed',
        30_000,
      );
    } else {
      await app.start();
      started = true;
      const receipt = await app.container
        .resolve(queueServiceToken)
        .producer(businessQueue)
        .publish('invoice.commit', input, {
          attempts: 2,
          backoff: { type: 'fixed', delay: 3_600_000 },
        });
      jobId = receipt.jobId;
      await waitFor(
        async () => (await observer!.getJobState(jobId)) === 'delayed',
        30_000,
      );
      assert.equal((await observer.getJob(jobId))!.attemptsMade, 1);
    }
    const business = new DurableBusinessEffect(
      path.join(root, 'business.sqlite'),
    );
    try {
      const snapshot = business.snapshot();
      const attempts = phase === 'retry-effect' ? 2 : 1;
      assert.equal(snapshot.attempts.length, attempts);
      assert.equal(snapshot.effects.length, 1);
      assert.equal(snapshot.effects[0]!.business_key, businessKey);
      assert.equal(snapshot.effects[0]!.payload, JSON.stringify(input));
      if (attempts === 2) {
        assert.notEqual(
          snapshot.attempts[0]!.process_id,
          snapshot.attempts[1]!.process_id,
        );
        assert.equal(
          snapshot.effects[0]!.process_id,
          snapshot.attempts[0]!.process_id,
        );
        assert.equal((await observer.getJob(jobId))!.attemptsMade, 2);
      }
      await writeFile(
        path.join(
          root,
          phase === 'fail-effect' ? 'effect-first.json' : 'effect-retry.json',
        ),
        JSON.stringify({ pid: process.pid, jobId, ...snapshot }),
      );
    } finally {
      business.close();
    }
  }
} finally {
  try {
    if (started) await app.shutdown();
  } finally {
    await observer?.close();
  }
}
