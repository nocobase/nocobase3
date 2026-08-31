/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { FeatureManager } from '../../features/default.js';
import type { KnowledgeBaseFeature } from '../../features/knowledge-base.js';
import type { VectorDatabaseFeature } from '../../features/vector-database.js';
import type { VectorDatabaseProviderFeature } from '../../features/vector-database-provider.js';
import type { VectorStoreProviderFeature } from '../../features/vector-store-provider.js';

export type AIFeatures = {
  vectorDatabase: VectorDatabaseFeature;
  vectorDatabaseProvider: VectorDatabaseProviderFeature;
  vectorStoreProvider: VectorStoreProviderFeature;
  knowledgeBase: KnowledgeBaseFeature;
};

export interface AIFeatureManager extends FeatureManager<AIFeatures> {
  get vectorDatabase(): VectorDatabaseFeature;
  get vectorDatabaseProvider(): VectorDatabaseProviderFeature;
  get vectorStoreProvider(): VectorStoreProviderFeature;
  get knowledgeBase(): KnowledgeBaseFeature;
}
