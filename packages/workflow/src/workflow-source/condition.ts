import { defineNode, type ConfigIssue, type NodeFactory } from './core.js';

import {
  validateConditionConfig,
  type ConditionConfig,
} from '../server/instructions/condition.js';
import type { JsonObject } from '../server/types.js';

function validateConfig(config: unknown): ConfigIssue[] {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return [{ path: 'config', message: 'condition config must be an object' }];
  }
  const errors = validateConditionConfig(config as JsonObject);
  return Object.entries(errors ?? {}).map(([path, message]) => ({ path: `config.${path}`, message }));
}

export const condition: NodeFactory<'condition', ConditionConfig, 'yes' | 'no'> = defineNode({
  type: 'condition',
  branches: ['yes', 'no'],
  validateConfig,
});

export type { ConditionConfig } from '../server/instructions/condition.js';
