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
 * Development runs straight from `src`, which Node 24 strips types from. A published install lives in `node_modules`,
 * where Node refuses to strip types, so it runs the compiled `dist` instead. `files` ships only `bin` and `dist`, which
 * makes the presence of `src` a reliable signal for which mode this is.
 */
const srcEntry = path.join(root, 'src/cli.ts');
const useDist =
  process.env.NOCOBASE_HUB_INSTALLER_USE_DIST === '1' || !existsSync(srcEntry);
const entry = useDist ? '../dist/cli.js' : '../src/cli.ts';

const pjson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const { runInstaller } = await import(entry);

const exitCode = await runInstaller({
  argv: process.argv.slice(2),
  binary: 'hub-installer',
  version: pjson.version,
});

process.exit(exitCode);
