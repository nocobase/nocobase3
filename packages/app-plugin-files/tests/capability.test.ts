import { describe, expect, it } from 'vitest';

import {
  createFileCapabilityCodec,
  ExpiredFileCapabilityError,
  InvalidFileCapabilityError,
} from '../server/internal/capability.js';

const secret = 'test-files-capability-secret-at-least-32-characters';
const now = new Date('2026-08-24T00:00:00.000Z');

describe('Files capability codec', () => {
  it('issues opaque versioned credentials and verifies their bound fields', () => {
    const codec = createFileCapabilityCodec({
      audience: 'app-one',
      secret,
      clock: () => now,
    });
    const credential = codec.issue({
      action: 'upload',
      fileId: 'file-one',
      expiresAt: now.getTime() + 60_000,
      candidateKey: 'pending/file-one/candidate',
      readyKey: 'ready/file-one/final',
      maxBytes: 100,
      expectedSize: 13,
      contentType: 'text/plain',
      allowedExtensions: ['.txt'],
      allowedContentTypes: ['text/plain'],
    });

    expect(credential).toMatch(
      /^fc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(credential).not.toContain('file-one');
    expect(credential).not.toContain('text/plain');
    expect(
      codec.verify({ fileId: 'file-one', action: 'upload' }, credential),
    ).toMatchObject({
      version: 1,
      audience: 'app-one',
      fileId: 'file-one',
      action: 'upload',
      maxBytes: 100,
      expectedSize: 13,
    });
  });

  it('rejects cross-App, cross-file, cross-action, expired, and tampered credentials', () => {
    const codec = createFileCapabilityCodec({
      audience: 'app-one',
      secret,
      clock: () => now,
    });
    const otherApp = createFileCapabilityCodec({
      audience: 'app-two',
      secret,
      clock: () => now,
    });
    const credential = codec.issue({
      action: 'complete',
      fileId: 'file-one',
      expiresAt: now.getTime() + 60_000,
      candidateKey: 'pending/file-one/candidate',
      readyKey: 'ready/file-one/final',
      maxBytes: 100,
      expectedSize: 13,
      contentType: null,
      allowedExtensions: [],
      allowedContentTypes: [],
    });

    expect(() =>
      otherApp.verify({ fileId: 'file-one', action: 'complete' }, credential),
    ).toThrow(InvalidFileCapabilityError);
    expect(() =>
      codec.verify({ fileId: 'file-two', action: 'complete' }, credential),
    ).toThrow(InvalidFileCapabilityError);
    expect(() =>
      codec.verify({ fileId: 'file-one', action: 'upload' }, credential),
    ).toThrow(InvalidFileCapabilityError);

    const parts = credential.split('.');
    const encrypted = parts[2] ?? '';
    const tamperedEncrypted = `${encrypted[0] === 'A' ? 'B' : 'A'}${encrypted.slice(1)}`;
    const tampered = [parts[0], parts[1], tamperedEncrypted, parts[3]].join(
      '.',
    );
    expect(() =>
      codec.verify({ fileId: 'file-one', action: 'complete' }, tampered),
    ).toThrow(InvalidFileCapabilityError);

    const expired = codec.issue({
      action: 'read',
      fileId: 'file-one',
      expiresAt: now.getTime() - 1,
      disposition: 'attachment',
    });
    expect(() =>
      codec.verify({ fileId: 'file-one', action: 'read' }, expired),
    ).toThrow(ExpiredFileCapabilityError);
  });
});
