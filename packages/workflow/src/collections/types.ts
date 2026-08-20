import type { CollectionDefinitionBuilder } from '@nocobase/database';

import type { WorkflowCollectionName } from './names.js';

export interface WorkflowCollectionSchema {
  name: WorkflowCollectionName;
  define: (collection: CollectionDefinitionBuilder) => void;
}
