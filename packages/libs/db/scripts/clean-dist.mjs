import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

fs.rmSync(path.join(packageDirectory, 'dist'), {
  recursive: true,
  force: true,
});
