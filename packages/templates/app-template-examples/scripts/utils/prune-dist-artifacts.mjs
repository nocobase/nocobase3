import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';
process.exitCode = await runAppTool('utils/prune-dist-artifacts', {
  rootDir: path.resolve(import.meta.dirname, '..', '..'),
});
