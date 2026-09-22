import path from 'node:path';
import { createAppCommands } from '@nocobase/app-cli';

export default createAppCommands({
  rootDir: path.resolve(import.meta.dirname, '..'),
  publishing: true,
});
