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
const srcEntry = path.join(root, 'src/create.ts');
const useDist =
  process.env.NOCOBASE_CREATE_PLUGIN_USE_DIST === '1' || !existsSync(srcEntry);
const entry = useDist ? '../dist/create.js' : '../src/create.ts';
const manifest = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const { runCreatePluginCli } = await import(entry);

const exitCode = await runCreatePluginCli({
  argv: process.argv.slice(2),
  binary: 'create-plugin',
  version: manifest.version,
});

process.exit(exitCode);
