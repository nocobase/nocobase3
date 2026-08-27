import { HTTPException } from 'hono/http-exception';

import type { FileStore, FilesService } from '../types.js';
import { FILES_DEMO_COLLECTIONS } from './constants.js';

export function createProfileAvatarStore(files: FilesService): FileStore {
  return files.createDatabaseStore({
    table: FILES_DEMO_COLLECTIONS.profileAvatars,
    scope: (context) => ({
      profileId: parsePositiveIntegerPathParameter(
        context.req.param('profileId'),
      ),
    }),
  });
}

export function createOrderAttachmentStore(files: FilesService): FileStore {
  return files.createDatabaseStore({
    table: FILES_DEMO_COLLECTIONS.orderAttachments,
    scope: (context) => ({
      orderId: parsePositiveIntegerPathParameter(context.req.param('orderId')),
    }),
  });
}

function parsePositiveIntegerPathParameter(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new HTTPException(400, {
      message: 'File scope path parameter must be a positive integer.',
    });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HTTPException(400, {
      message: 'File scope path parameter must be a positive integer.',
    });
  }
  return parsed;
}
