/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AppRuntimeRegistry } from '../app-registry.ts';
import type { AppDefinition } from '../app-types.ts';
import type { DeploymentCatalog } from './catalog.ts';

export interface StandaloneReconcileResult {
  registered: AppDefinition[];
  updated: AppDefinition[];
  unchanged: AppDefinition[];
  removed: AppDefinition[];
}

export class StandaloneReconciler {
  constructor(
    private readonly catalog: DeploymentCatalog,
    private readonly registry: AppRuntimeRegistry,
  ) {}

  async reconcile(): Promise<StandaloneReconcileResult> {
    const discovered = await this.catalog.discover();
    const discoveredIds = new Set(
      discovered.map((definition) => definition.id),
    );
    const result: StandaloneReconcileResult = {
      registered: [],
      updated: [],
      unchanged: [],
      removed: [],
    };

    for (const definition of discovered) {
      const current = this.registry.definition(definition.id);
      if (!current) {
        result.registered.push(
          await this.registry.registerDefinition(definition),
        );
        continue;
      }
      if (this.definitionsEqual(current, definition)) {
        result.unchanged.push(current);
        continue;
      }

      const replacement = await this.registry.replaceDefinition(definition, {
        activate: this.registry.snapshot(definition.id) !== undefined,
        reason: 'standalone deployment changed',
      });
      result.updated.push(replacement.definition);
    }

    for (const definition of this.registry.listDefinitions()) {
      if (discoveredIds.has(definition.id)) {
        continue;
      }
      await this.registry.unregister(definition.id, {
        reason: 'standalone deployment removed',
      });
      result.removed.push(definition);
    }

    return result;
  }

  private definitionsEqual(left: AppDefinition, right: AppDefinition): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
