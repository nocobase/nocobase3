import { describe, expect, it } from 'vitest';
import {
  formatUnsupportedNodeVersionMessage,
  getNodeMajorVersion,
  isSupportedNodeVersion,
  MINIMUM_NODE_MAJOR_VERSION,
} from '../bin/node-version.js';

describe('Node version guard', () => {
  it('requires the runtime version declared by the package', () => {
    expect(MINIMUM_NODE_MAJOR_VERSION).toBe(24);
    expect(isSupportedNodeVersion('23.11.0')).toBe(false);
    expect(isSupportedNodeVersion('24.0.0')).toBe(true);
    expect(isSupportedNodeVersion('25.1.0')).toBe(true);
  });

  it('parses both process-style and package-style versions', () => {
    expect(getNodeMajorVersion('v24.19.0')).toBe(24);
    expect(getNodeMajorVersion('24.19.0')).toBe(24);
    expect(getNodeMajorVersion('invalid')).toBeNaN();
  });

  it('provides an actionable error', () => {
    const message = formatUnsupportedNodeVersionMessage('v22.14.0');

    expect(message).toContain('Node.js 24 or later is required');
    expect(message).toContain('Current version is v22.14.0');
  });
});
