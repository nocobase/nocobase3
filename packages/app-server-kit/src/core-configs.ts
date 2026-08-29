import { cachingConfig } from './caching/index.js';
import { appConfig, type AppConfigDefinition } from './config/index.js';
import { databaseConfig } from './database/index.js';
import { driveConfig } from './drive/index.js';
import { snowflakeConfig } from './id-generator/index.js';
import { loggingConfig } from './logging/index.js';
import { nodeServerConfig } from './node/index.js';
import { queueConfig } from './queue/index.js';
import type { ResolvedAppRuntimeConfigContext } from './runtime/index.js';
import { sessionConfig } from './session/index.js';
import { spaConfig } from './spa/index.js';

export const coreConfigs: readonly AppConfigDefinition<
  unknown,
  ResolvedAppRuntimeConfigContext
>[] = [
  appConfig,
  cachingConfig,
  databaseConfig,
  driveConfig,
  loggingConfig,
  queueConfig,
  sessionConfig,
  nodeServerConfig,
  snowflakeConfig,
  spaConfig,
];
