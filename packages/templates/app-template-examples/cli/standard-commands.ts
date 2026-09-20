import path from 'node:path';
import { createAppCommands } from '@nocobase/app-cli';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
const rootDir = path.resolve(import.meta.dirname, '..');
export default createAppCommands(
  {
    rootDir,
    loadRuntime: async () => {
      const { default: runtime } = await import('../server/runtime.js');
      return resolveStandaloneAppRuntime(runtime, { rootDir });
    },
  },
  { publishing: false },
);
