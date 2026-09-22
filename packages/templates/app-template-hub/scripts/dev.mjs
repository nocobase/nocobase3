import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';

process.exitCode = await runAppTool('dev', {
  rootDir: path.resolve(import.meta.dirname, '..'),
});
