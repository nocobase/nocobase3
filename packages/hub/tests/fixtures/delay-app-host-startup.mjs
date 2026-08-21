import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { DirectoryAppCatalog } from '@nocobase/app-host';

const marker = process.env.HUB_LIFECYCLE_STARTUP_MARKER;
const discover = DirectoryAppCatalog.prototype.discover;

DirectoryAppCatalog.prototype.discover = async function delayedDiscover() {
  if (marker) {
    await writeFile(marker, 'started');
    await delay(300);
  }
  return discover.call(this);
};
