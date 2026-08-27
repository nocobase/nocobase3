#!/usr/bin/env node

import { executeCommandSurface } from './execute.js';

await executeCommandSurface({
  argv: process.argv.slice(2),
  bin: 'pnpm run',
  dirname: 'nocobase-app',
  errorLabel: 'NocoBase app',
  nodeVersionLabel: 'nocobase-app',
  sourceDirectory: 'app-scripts',
});
