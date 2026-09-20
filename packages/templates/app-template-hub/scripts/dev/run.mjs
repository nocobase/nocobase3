import path from 'node:path';
import { superviseDevelopment } from './supervisor.mjs';

const rootDir = path.resolve(import.meta.dirname, '..', '..');
process.exitCode = await superviseDevelopment({
  rootDir,
  entry: path.join(rootDir, 'scripts/dev/index.mjs'),
});
