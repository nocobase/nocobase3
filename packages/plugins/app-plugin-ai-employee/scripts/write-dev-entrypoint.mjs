import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const targetDir = path.join(packageDir, 'dist', 'client', 'dev');

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(
  path.join(targetDir, 'demo-pages.js'),
  "export * from '../../../client/dev/demo-pages.js';\n",
);
fs.writeFileSync(
  path.join(targetDir, 'demo-pages.d.ts'),
  "export * from '../../../client/dev/demo-pages.js';\n",
);
