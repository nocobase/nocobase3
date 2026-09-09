#!/usr/bin/env node

import { existsSync } from 'node:fs';
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
 * Node 24 strips types from `.ts` files it loads directly, so development runs sources straight from `src` with no
 * loader and no re-exec. That does not work once the package lives in `node_modules`, where Node refuses type
 * stripping outright, so published installs must run the compiled `dist` output instead. `files` ships only `bin` and
 * `dist`, which makes the presence of `src/runtime` a reliable signal for which of the two modes we are in.
 */
const useDist =
  process.env.NB3_CLI_USE_DIST === '1' ||
  !existsSync(path.join(root, 'src/runtime'));
const runtimeEntry = useDist ? './dist/runtime/run.js' : './src/runtime/run.ts';

const { runAppCli } = await import(
  new URL(runtimeEntry, `file://${root}/`).href
);

// Invoked outside an app, this runs the built-in commands alone. An app gets the same assembly with its own commands
// and its plugins' commands merged in, through `cli/index.ts`.
await runAppCli();
