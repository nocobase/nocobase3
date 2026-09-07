/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { resolveAppHostMode } from '../dist/index.js';

describe('resolveAppHostMode', () => {
  it('defaults to standalone mode', () => {
    expect(resolveAppHostMode(undefined)).toBe('standalone');
    expect(resolveAppHostMode('')).toBe('standalone');
  });

  it('accepts managed mode', () => {
    expect(resolveAppHostMode('managed')).toBe('managed');
  });

  it('rejects unknown modes', () => {
    expect(() => resolveAppHostMode('automatic')).toThrow(
      'Invalid app host mode "automatic"',
    );
  });
});
