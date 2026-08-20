import { defineTrigger, type ConfigIssue, type TriggerFactory } from '../core.js';

import { customTrigger } from '../../server/triggers/custom.js';
import type { JsonObject } from '../../server/types.js';

export type CustomConfig = Record<string, never>;

function validateConfig(config: unknown): ConfigIssue[] {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return [{ path: 'config', message: 'custom trigger config must be an object' }];
  }
  const errors = customTrigger.validateConfig?.(config as JsonObject);
  return Object.entries(errors ?? {}).map(([path, message]) => ({ path: `config.${path}`, message }));
}

export const custom: TriggerFactory<'custom', CustomConfig> = defineTrigger({
  type: 'custom',
  validateConfig,
});
