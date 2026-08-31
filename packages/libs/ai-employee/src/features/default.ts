/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export interface FeatureManager<T> {
  enableFeatures(features: Partial<T>): void;
  disableFeatures(features: (keyof T)[]): void;
  isFeaturesEnabled(features: (keyof T)[]): boolean;
}

export abstract class BaseFeatureManager<T> implements FeatureManager<T> {
  protected features: Partial<T> = {};

  enableFeatures(features: Partial<T>) {
    this.features = {
      ...this.features,
      ...features,
    };
  }

  disableFeatures(features: (keyof T)[]): void {
    for (const feature of features) {
      if (this.features[feature]) {
        delete this.features[feature];
      }
    }
  }

  isFeaturesEnabled(features: (keyof T)[]): boolean {
    return Array.from(features).every((f) => this.features[f]);
  }
}

export type FeatureKeys<T> = { [key in keyof T]: key };
