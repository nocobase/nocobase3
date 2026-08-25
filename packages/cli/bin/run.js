#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatUnsupportedNodeVersionMessage,
  isSupportedNodeVersion,
} from './node-version.js';

if (!isSupportedNodeVersion()) {
  console.error(formatUnsupportedNodeVersionMessage(process.version));
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Node 24 strips types from `.ts` files it loads directly, so development runs command sources straight from `src`
 * with no loader and no re-exec. That does not work once the package lives in `node_modules`, where Node refuses type
 * stripping outright, so published installs must run the compiled `dist` output instead. `files` ships only `bin` and
 * `dist`, which makes the presence of `src/commands` a reliable signal for which of the two modes we are in.
 */
const srcCommandsDir = path.join(root, 'src/commands');
const useDist =
  process.env.NB3_CLI_USE_DIST === '1' || !existsSync(srcCommandsDir);
const commandsDir = useDist ? './dist/commands' : './src/commands';

const pjson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
pjson.oclif.commands = commandsDir;
pjson.oclif.helpClass = useDist
  ? './dist/help/runtime-help.js'
  : './src/help/runtime-help.ts';

const { Config, flush, run, settings } = await import('@oclif/core');

if (!useDist) {
  settings.debug = Boolean(process.env.NB3_CLI_DEBUG);
}

try {
  const config = await Config.load({ pjson, root });
  await run(process.argv.slice(2), config);
  flush();
} catch (error) {
  const oclifExit = error?.oclif?.exit;
  if (typeof oclifExit === 'number') {
    if (error.message && oclifExit !== 0) {
      console.error(error.message);
    }
    process.exit(oclifExit);
  }

  console.error(error?.message ? `[nb3]: ${error.message}` : error);
  process.exit(1);
}
