import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';
process.exitCode = await runAppTool('utils/clean-dist-bin', {
  rootDir: path.resolve(import.meta.dirname, '..', '..'),
});
