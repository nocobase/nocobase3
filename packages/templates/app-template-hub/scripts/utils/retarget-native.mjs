import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';
process.exitCode = await runAppTool('utils/retarget-native', {
  rootDir: path.resolve(import.meta.dirname, '..', '..'),
});
