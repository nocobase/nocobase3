import type {
  BuilderExecOptions,
  BuilderResult,
  CollectionBuilder,
} from '@nocobase/database';

import { workflowCollectionSchemas } from './collections/index.js';

export async function createWorkflowCollections(
  builder: CollectionBuilder,
  options: BuilderExecOptions = {},
): Promise<BuilderResult[]> {
  const results: BuilderResult[] = [];

  for (const schema of workflowCollectionSchemas) {
    results.push(
      await builder.createCollection(schema.name, schema.define, options),
    );
  }

  return results;
}
