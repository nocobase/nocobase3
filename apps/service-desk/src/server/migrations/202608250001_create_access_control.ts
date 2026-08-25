import { createAppAccessControlMigration } from '@nocobase/app-plugin-access-control/server';

import { serviceDeskAccessControlDefinition } from '../access-control.js';

export default createAppAccessControlMigration(
  '202608250001_create_access_control',
  serviceDeskAccessControlDefinition,
);
