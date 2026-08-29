#!/usr/bin/env node

import { executeCommandSurface } from './execute.js';

await executeCommandSurface({
  argv: process.argv.slice(2),
  bin: 'nb3',
  dirname: 'nb3',
  errorLabel: 'nb3',
  nodeVersionLabel: 'nb3',
  sourceDirectory: 'commands',
});
