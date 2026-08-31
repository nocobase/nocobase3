/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type {
  VectorDatabaseFeature,
  VectorDatabaseInfo,
} from './vector-database.js';
export type {
  VectorDatabaseProviderFeature,
  VectorDatabaseProviderInfo,
  VectorDatabaseProvider,
} from './vector-database-provider.js';
export type {
  VectorStoreProviderFeature,
  VectorStoreProvider,
  VectorStoreService,
  VectorStoreSearchOptions,
} from './vector-store-provider.js';
export type { KnowledgeBaseFeature } from './knowledge-base.js';
export type { FeatureKeys, FeatureManager } from './default.js';
export { BaseFeatureManager } from './default.js';
