import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { superviseDevelopment } from './supervisor.mjs';

const rootDir = path.resolve(process.env.NOCOBASE_TOOL_ROOT || process.cwd());
process.exitCode = await superviseDevelopment({
  rootDir,
  entry: fileURLToPath(new URL('./index.mjs', import.meta.url)),
});
