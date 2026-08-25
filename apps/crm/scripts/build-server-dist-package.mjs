import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildServerDistPackage } from '../../../packages/app-server-kit/scripts/build-server-dist-package.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

buildServerDistPackage({ rootDir });
