import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';
process.exitCode = await runAppTool('utils/build-server-dist-package', {
  rootDir: path.resolve(import.meta.dirname, '..', '..'),
});
