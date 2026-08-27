import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeServerDistPackage } from '@nocobase/app-server-kit/build/server-dist';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

finalizeServerDistPackage({ rootDir });
