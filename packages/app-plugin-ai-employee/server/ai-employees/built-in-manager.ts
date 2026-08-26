/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 *
 * Migration note: the i18n namespace is provided by the App request Context
 * and defaults to the app package name.
 */

import type { Context } from '../context.js';
import type { AIEmployee } from '@nocobase/ai-employee';
import _ from 'lodash';

export class BuiltInManager {
  constructor(private readonly i18nNamespace = 'app') {}

  setupBuiltInInfo(ctx: Context, aiEmployee: AIEmployee) {
    if (!aiEmployee) {
      return;
    }
    if (!aiEmployee.builtIn) {
      return;
    }
    const ns = this.i18nNamespace;
    aiEmployee.nickname = ctx.t?.(aiEmployee.nickname, { ns });
    aiEmployee.position = ctx.t?.(aiEmployee.position, { ns });
    aiEmployee.bio = ctx.t?.(aiEmployee.bio, { ns });
    aiEmployee.greeting = ctx.t?.(aiEmployee.greeting, { ns });
  }
}
