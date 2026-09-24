import type { ViteUserConfig } from 'vitest/config';
import { mergeConfig } from 'vitest/config';

import { sharedHookTimeout, sharedTestTimeout } from './timeouts.js';

const nodeConfig: ViteUserConfig = {
  test: {
    // Queue discovery dynamically imports application TypeScript. Keep its
    // loader inside Vitest so those imports use the same transform and registry.
    server: { deps: { inline: ['@boringnode/queue'] } },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    testTimeout: sharedTestTimeout,
    hookTimeout: sharedHookTimeout,
  },
};

export const createNodeVitestConfig: (
  localConfig?: ViteUserConfig,
) => ViteUserConfig = (localConfig = {}) =>
  mergeConfig(nodeConfig, localConfig);
