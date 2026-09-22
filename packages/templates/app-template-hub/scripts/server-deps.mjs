import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';

const [operation, ...args] = process.argv.slice(2);
if (operation !== 'retarget' && operation !== 'verify') {
  console.error(
    'Usage: node scripts/server-deps.mjs <retarget|verify> [options]',
  );
  process.exitCode = 2;
} else {
  process.exitCode = await runAppTool(operation, {
    rootDir: path.resolve(import.meta.dirname, '..'),
    args,
  });
}
