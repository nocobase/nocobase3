import { describe, expect, it } from 'vitest';
import {
  MINIMUM_NODE_MAJOR_VERSION,
  formatUnsupportedNodeVersionMessage,
  getNodeMajorVersion,
  isSupportedNodeVersion,
} from '../bin/node-version.js';

describe('getNodeMajorVersion', () => {
  it('reads the major version with or without a leading v', () => {
    expect(getNodeMajorVersion('v24.13.0')).toBe(24);
    expect(getNodeMajorVersion('24.13.0')).toBe(24);
  });

  it('returns NaN for something that is not a version', () => {
    expect(getNodeMajorVersion('')).toBeNaN();
    expect(getNodeMajorVersion('unknown')).toBeNaN();
  });
});

describe('isSupportedNodeVersion', () => {
  it('requires the Node version the package declares in engines', () => {
    expect(MINIMUM_NODE_MAJOR_VERSION).toBe(24);
    expect(isSupportedNodeVersion('v23.11.0')).toBe(false);
    expect(isSupportedNodeVersion('v24.0.0')).toBe(true);
    expect(isSupportedNodeVersion('v25.0.0')).toBe(true);
  });

  it('treats an unreadable version as unsupported rather than assuming the best', () => {
    expect(isSupportedNodeVersion('unknown')).toBe(false);
  });

  it('accepts the Node running these tests', () => {
    expect(isSupportedNodeVersion()).toBe(true);
  });
});

describe('formatUnsupportedNodeVersionMessage', () => {
  it('names the required version and the one in use', () => {
    const message = formatUnsupportedNodeVersionMessage('v20.0.0');

    expect(message).toContain('[nb3]');
    expect(message).toContain('24');
    expect(message).toContain('v20.0.0');
  });

  it('accepts an explicit label for the app package-script executable', () => {
    const message = formatUnsupportedNodeVersionMessage(
      'v20.0.0',
      'nocobase-app',
    );

    expect(message).toContain('[nocobase-app]');
    expect(message).not.toContain('[nb3]');
  });

  it('says the version is unknown instead of printing an empty gap', () => {
    expect(formatUnsupportedNodeVersionMessage('')).toContain('unknown');
  });
});
