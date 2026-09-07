import { bindAuditRecorder } from '@nocobase/app-plugin-audit/server';
import { createAuditApiFixture } from '../../../app-plugin-audit/tests/helpers/api-fixture.js';
import type { DatabaseDialect } from '@nocobase/db';
import type { AIEmployeeAuditBridge } from '../../server/audit.js';

export async function createAIAuditFixture(dialect: DatabaseDialect) {
  const fixture = await createAuditApiFixture(dialect);
  const bind: AIEmployeeAuditBridge['service']['bind'] = (scope, options) =>
    bindAuditRecorder(scope, {
      store: fixture.f.store,
      producer: options.producer,
      policy: async () => ({
        enabled: true,
        revision: 1,
        maxDetailsBytes: 65536,
      }),
    });
  const runtime = fixture.runtime;
  const bridge: AIEmployeeAuditBridge = {
    runtime,
    collector: fixture.http.collector,
    service: {
      bind,
      http: (declaration) => fixture.http.collector.http(declaration),
    },
  };
  return { fixture, bridge, runtime, cleanup: fixture.cleanup };
}

export async function prepareAIRuntime(
  f: Awaited<ReturnType<typeof createAIAuditFixture>>,
) {
  const { createMigrator } = await import('@nocobase/db');
  const { fileURLToPath } = await import('node:url');
  const { createConfigPaths } = await import('@nocobase/app-server/config');
  const { createCaching } = await import('@nocobase/caching');
  const { createLogging } = await import('@nocobase/logging');
  const { SnowflakeIdGenerator } = await import('@nocobase/snowflake');
  const { createAIManager, DriveFileStorageFactory } =
    await import('@nocobase/ai-employee');
  const { Readable } = await import('node:stream');
  const {
    initializePluginRuntimeResources,
    createPluginRuntime,
    waitForPluginReady,
  } = await import('../../server/runtime.js');
  const { authenticationToken } =
    await import('@nocobase/app-plugin-authentication/server');
  const { AuditModelProvider } = await import('./audit-model.js');
  const deps: import('../../server/runtime.js').AppDeps = {
    ai: createAIManager(),
    paths: createConfigPaths({ rootDir: process.cwd() }),
    database: f.fixture.f.manager,
    auth: f.fixture.app.container.resolve(authenticationToken),
    caching: createCaching(),
    logging: createLogging({ level: 'silent' }),
    idGenerator: new SnowflakeIdGenerator({ workerId: 0 }),
    aiStorageDisk: 'local',
    fileStorageFactory: new DriveFileStorageFactory({
      use: () => ({
        put: async () => undefined,
        getStream: async () => Readable.from([]),
        getUrl: async () => '/synthetic',
      }),
    }),
  };
  await createMigrator({
    database: deps.database,
    packageName: '@nocobase/app-plugin-ai-employee',
    directory: fileURLToPath(
      new URL('../../database/migrations', import.meta.url),
    ),
  }).latest();
  initializePluginRuntimeResources(deps, { loadResources: false });
  await waitForPluginReady();
  const runtime = createPluginRuntime({ deps });
  await runtime.repositories.aiEmployees.create({
    values: {
      username: 'trusted-employee',
      nickname: 'Synthetic employee',
      enabled: true,
      builtIn: true,
      chatSettings: { systemPromptMode: 'none', enableSkills: false },
    },
  });
  deps.ai.llmProviderManager.registerLLMProvider('g18', {
    title: 'Synthetic model',
    provider: AuditModelProvider,
  });
  await deps.ai.llmServiceManager.registerLLMService({
    name: 'g18-model',
    provider: 'g18',
    enabled: true,
    enabledModels: ['g18'],
  });
  let effects = 0;
  await deps.ai.toolsManager.registerTools({
    scope: 'GENERAL',
    requiresContext: false,
    defaultPermission: 'ALLOW',
    definition: {
      name: 'g18Tool',
      description: 'Synthetic local tool',
      schema: { type: 'object', properties: { value: { type: 'string' } } },
    },
    invoke: async () => {
      effects++;
      if (effects % 2 === 1)
        throw new Error('G18_MODEL_PROMPT_ARGS_OUTPUT_SENTINEL');
      return {
        status: 'success',
        content: 'G18_MODEL_PROMPT_ARGS_OUTPUT_SENTINEL',
      };
    },
  });
  return { runtime, deps, effects: () => effects };
}
