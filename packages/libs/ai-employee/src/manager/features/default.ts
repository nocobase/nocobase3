/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AIFeatureManager, AIFeatures } from './types.js';
import {
  BaseFeatureManager,
  type FeatureKeys,
  type KnowledgeBaseFeature,
  type VectorDatabaseFeature,
  type VectorDatabaseProviderFeature,
  type VectorStoreProviderFeature,
} from '../../features/index.js';

export class DefaultAIFeatureManager
  extends BaseFeatureManager<AIFeatures>
  implements AIFeatureManager
{
  get vectorDatabase(): VectorDatabaseFeature {
    if (!this.features.vectorDatabase) {
      throw this.featureNotSupportedError('vectorDatabase');
    }
    return this.features.vectorDatabase;
  }

  get vectorDatabaseProvider(): VectorDatabaseProviderFeature {
    if (!this.features.vectorDatabaseProvider) {
      throw this.featureNotSupportedError('vectorDatabaseProvider');
    }
    return this.features.vectorDatabaseProvider;
  }

  get vectorStoreProvider(): VectorStoreProviderFeature {
    if (!this.features.vectorStoreProvider) {
      throw this.featureNotSupportedError('vectorStoreProvider');
    }
    return this.features.vectorStoreProvider;
  }

  get knowledgeBase(): KnowledgeBaseFeature {
    if (!this.features.knowledgeBase) {
      throw this.featureNotSupportedError('knowledgeBase');
    }
    return this.features.knowledgeBase;
  }

  private featureNotSupportedError(featureName: string) {
    return new Error(`${featureName} is not supported`);
  }
}

export const EEFeatures: FeatureKeys<AIFeatures> = {
  vectorDatabase: 'vectorDatabase',
  vectorDatabaseProvider: 'vectorDatabaseProvider',
  vectorStoreProvider: 'vectorStoreProvider',
  knowledgeBase: 'knowledgeBase',
};
