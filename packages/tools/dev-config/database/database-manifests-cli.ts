#!/usr/bin/env node
import path from 'node:path';
import { generateDatabaseManifests } from './database-manifests.js';

const [sourceDir = 'database', outputDir = 'dist/database', ...extra] =
  process.argv.slice(2);
if (extra.length)
  throw new Error(
    'Usage: nocobase-db-manifests [source-database-dir] [output-database-dir]',
  );
await generateDatabaseManifests({
  sourceDir: path.resolve(sourceDir),
  outputDir: path.resolve(outputDir),
});
