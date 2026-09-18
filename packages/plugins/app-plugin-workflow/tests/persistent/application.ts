import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Application } from '@nocobase/app-server/application';
import { AppConfig, createConfigPaths } from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { LoggingProvider } from '@nocobase/app-server/logging';
import {
  QueueServiceProvider,
  queueServiceToken,
} from '@nocobase/app-server/queue';
import { databaseManagerToken } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createSilentLoggingConfig } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';
import type { QueueOptions, UnregisterHandler } from '@nocobase/queue';
import { WorkflowProvider } from '../../server/provider.js';
import { WorkflowService } from '../../server/service.js';
import {
  workflowServiceToken,
  internalWorkflowServiceToken,
} from '../../server/tokens.js';
import {
  buildWorkflowArtifact,
  writeWorkflowArtifact,
} from '../../build/artifact-builder.js';
import { WorkflowRepository } from '../../server/repositories/workflow-repository.js';
import { createWorkflowCollections } from '../helpers.js';
import { DurableBusinessEffect } from './business.js';
import { createBusinessInstruction } from './instruction.js';

export type AcceptanceApplication = Application<AppConfig>;

export const workflowKey = 'persistent-acceptance';
export const eventKey = 'accepted-before-process-exit';
export const businessKey = 'invoice-2026-09-18';
export const input: {
  businessKey: string;
  amount: number;
  enabled: boolean;
  nested: { zero: number; empty: string };
} = {
  businessKey,
  amount: 17,
  enabled: false,
  nested: { zero: 0, empty: '' },
};
export const businessQueue = 'durable-business-effect';

export async function emitRevision(
  root: string,
  revision: string,
  instructionType: string = 'run',
): Promise<string> {
  const built = buildWorkflowArtifact({
    key: workflowKey,
    flatIr: {
      title: revision,
      inputSchema: {
        type: 'object',
        properties: {
          businessKey: { type: 'string' },
          amount: { type: 'number' },
          enabled: { type: 'boolean' },
          nested: {
            type: 'object',
            properties: { zero: { type: 'number' }, empty: { type: 'string' } },
          },
        },
      },
      start: 'run',
      nodes: [
        {
          key: 'run',
          title: 'Run',
          type: instructionType,
          config:
            instructionType === 'run'
              ? { module: './server/run', args: { input: '{{$input}}' } }
              : {},
          upstreamKey: null,
          downstreamKey: null,
          branchKey: null,
        },
      ],
    },
    resourceFiles: new Map([
      [
        'server/run.js',
        `export function run(args) { return { revision: ${JSON.stringify(revision)}, input: args.input }; }`,
      ],
    ]),
  });
  await writeWorkflowArtifact(built, path.join(root, 'dist'));
  return built.digest;
}

export async function createAcceptanceApplication(
  root: string,
  options: QueueOptions,
  mode: 'initialize' | 'restart' | 'fail-effect' | 'retry-effect',
): Promise<AcceptanceApplication> {
  await mkdir(root, { recursive: true });
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({
    app: { name: options.namespace, publicBasePath: '' },
    logging: createSilentLoggingConfig(),
    database: {
      default: 'main',
      drivers: { sqlite },
      connections: {
        main: {
          dialect: 'sqlite',
          filename: path.join(root, 'business.sqlite'),
          migrations: { autoRun: false },
          seeds: { autoRun: false },
        },
      },
    },
    queue: options,
    drive: {
      default: 'local',
      disks: {
        local: {
          driver: 'fs',
          location: path.join(root, 'artifacts'),
          visibility: 'private',
        },
      },
    },
    workflow: {
      sourceRoot: path.join(root, 'source'),
      distRoot: path.join(root, 'dist'),
      artifactDisk: 'local',
      production: true,
    },
  });
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: root }),
  });
  class FixtureSchemaProvider extends ServiceProvider<AcceptanceApplication> {
    readonly name = 'persistent-acceptance-schema';
    override async boot(): Promise<void> {
      if (mode === 'initialize') {
        await createWorkflowCollections(
          this.app.container.resolve(databaseManagerToken).builder(),
        );
      }
    }
  }
  class BusinessProvider extends ServiceProvider<AcceptanceApplication> {
    readonly name = 'persistent-acceptance-business';
    private unregister?: UnregisterHandler;
    private business?: DurableBusinessEffect;
    override async boot(): Promise<void> {
      this.app.container
        .resolve(internalWorkflowServiceToken)
        .registerInstruction(createBusinessInstruction(root));
      if (mode !== 'fail-effect' && mode !== 'retry-effect') return;
      this.business = new DurableBusinessEffect(
        path.join(root, 'business.sqlite'),
      );
      this.unregister = this.app.container
        .resolve(queueServiceToken)
        .consumer(businessQueue)
        .consume<typeof input>(async (_channel, message) => {
          // The transaction has committed before the deliberate delivery failure.
          // The retry must use the same durable business key, not a process-local Set.
          this.business!.apply(message.businessKey, message);
          if (mode === 'fail-effect')
            throw new Error(
              'Injected failure after business commit, before queue acknowledgement',
            );
        });
    }
    override async shutdown(): Promise<void> {
      await this.unregister?.();
      this.business?.close();
    }
  }
  app.addServiceProviders([
    LoggingProvider,
    DatabaseProvider,
    FixtureSchemaProvider,
  ]);
  app.addServiceProvider(QueueServiceProvider, { nodeEnv: 'test' });
  app.addServiceProviders([WorkflowProvider, BusinessProvider]);
  return app;
}

export async function enableRevision(
  app: AcceptanceApplication,
  hash: string,
): Promise<void> {
  await new WorkflowRepository(
    app.container.resolve(databaseManagerToken),
    app.container.resolve(internalWorkflowServiceToken),
  ).enable(hash);
}

/** A deployment brings a new artifact catalog; the running service caches its old catalog. */
export async function replaceRevision(
  app: AcceptanceApplication,
  root: string,
): Promise<string> {
  const hash = await emitRevision(root, 'replacement');
  const deployment = new WorkflowService({
    database: app.container.resolve(databaseManagerToken),
    queue: app.container.resolve(queueServiceToken),
    services: app.container,
    distRoot: path.join(root, 'dist'),
    artifactDisk: {
      driver: 'fs',
      location: path.join(root, 'artifacts'),
      visibility: 'private',
    },
    production: true,
  });
  try {
    await new WorkflowRepository(
      app.container.resolve(databaseManagerToken),
      deployment,
    ).enable(hash);
  } finally {
    await deployment.dispose();
  }
  return hash;
}

export async function triggerWorkflow(
  app: AcceptanceApplication,
): Promise<void> {
  const receipt = await app.container
    .resolve(workflowServiceToken)
    .trigger(workflowKey, input, { eventKey });
  if (receipt.status !== 'accepted')
    throw new Error(`Workflow was not accepted: ${JSON.stringify(receipt)}`);
}
