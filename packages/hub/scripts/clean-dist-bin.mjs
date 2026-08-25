import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeServerDistPackage } from '../../app-server/scripts/build-server-dist-package.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

finalizeServerDistPackage({ rootDir });
