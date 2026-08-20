import { defineNode, type ConfigIssue, type NodeFactory } from './core.js';

import { validateRunConfig, type RunConfig } from '../server/instructions/run.js';
import type { JsonObject } from '../server/types.js';

function validateConfig(config: unknown): ConfigIssue[] {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return [{ path: 'config', message: 'run config must be an object' }];
  }
  const errors = validateRunConfig(config as JsonObject);
  return Object.entries(errors ?? {}).map(([path, message]) => ({ path: `config.${path}`, message }));
}

export const run: NodeFactory<'run', RunConfig> = defineNode({
  type: 'run',
  branches: null,
  validateConfig,
});

export type { RunConfig } from '../server/instructions/run.js';
