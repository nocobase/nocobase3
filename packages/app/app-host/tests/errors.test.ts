/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';

import {
  AppCreateFailedError,
  AppReloadFailedError,
  rootErrorMessage,
} from '../dist/errors.js';

describe('rootErrorMessage', () => {
  it('returns the actionable root cause from wrapped runtime errors', () => {
    const error = new AppReloadFailedError(
      'customer',
      new AppCreateFailedError(
        'customer',
        new Error('auth.secret is required.'),
      ),
    );

    expect(rootErrorMessage(error)).toBe('auth.secret is required.');
  });

  it('preserves ordinary error messages and non-error values', () => {
    expect(rootErrorMessage(new Error('artifact is unavailable'))).toBe(
      'artifact is unavailable',
    );
    expect(rootErrorMessage('deployment failed')).toBe('deployment failed');
  });

  it('does not loop when an error has a cyclic cause', () => {
    const error = new Error('cyclic failure');
    Object.defineProperty(error, 'cause', { value: error });

    expect(rootErrorMessage(error)).toBe('cyclic failure');
  });
});
