/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AppRuntime } from './app-runtime.ts';
import type {
  ActiveAppHandle,
  AppActivationBackend,
  AppActivationRequest,
} from './app-types.ts';
import { AppEventBus } from './events.ts';

export class InProcessAppBackend implements AppActivationBackend {
  readonly kind = 'in-process' as const;

  constructor(private readonly globalEvents: AppEventBus) {}

  async activate(request: AppActivationRequest): Promise<ActiveAppHandle> {
    return AppRuntime.create({
      version: request.version,
      definition: request.definition,
      createApp: request.createApp,
      globalEvents: this.globalEvents,
    });
  }
}
