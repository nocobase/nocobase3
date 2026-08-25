import { describe, expect, it } from 'vitest';

import {
  createFileCapabilityCodec,
  ExpiredFileCapabilityError,
  InvalidFileCapabilityError,
} from '../server/internal/capability.js';
import {
  createScopedFileCapabilityCodec,
  ExpiredScopedFileCapabilityError,
  InvalidScopedFileCapabilityError,
} from '../server/internal/scoped-capability.js';

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

  it('supports a distinct Core cancel action', () => {
    const codec = createFileCapabilityCodec({
      audience: 'app-one',
      secret,
      clock: () => now,
    });
    const credential = codec.issue({
      action: 'cancel',
      fileId: 'file-one',
      expiresAt: now.getTime() + 60_000,
      candidateKey: 'pending/file-one/candidate',
      maxBytes: 100,
      expectedSize: 13,
      contentType: null,
      allowedExtensions: [],
      allowedContentTypes: [],
    });
    expect(
      codec.verify({ fileId: 'file-one', action: 'cancel' }, credential),
    ).toMatchObject({ action: 'cancel', fileId: 'file-one' });
    expect(() =>
      codec.verify({ fileId: 'file-one', action: 'complete' }, credential),
    ).toThrow(InvalidFileCapabilityError);
  });
});

describe('Scoped Files capability codec', () => {
  it('binds scope, record, file, replace target, action, audience, and expiry', () => {
    const codec = createScopedFileCapabilityCodec({
      audience: 'app-one',
      secret,
      clock: () => now,
    });
    const credential = codec.issue({
      scope: 'relation:attachments',
      recordId: 'order-one',
      fileId: 'file-one',
      replaceFileId: 'old-file',
      action: 'complete',
      expiresAt: now.getTime() + 60_000,
      candidateKey: 'pending/file-one/candidate',
      maxBytes: 100,
      expectedSize: 13,
      contentType: 'text/plain',
      allowedExtensions: ['.txt'],
      allowedContentTypes: ['text/plain'],
    });

    expect(credential).toMatch(
      /^fs1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(credential).not.toContain('order-one');
    expect(
      codec.verify(
        {
          scope: 'relation:attachments',
          recordId: 'order-one',
          fileId: 'file-one',
          action: 'complete',
        },
        credential,
      ),
    ).toMatchObject({ replaceFileId: 'old-file' });

    for (const input of [
      {
        scope: 'relation:other',
        recordId: 'order-one',
        fileId: 'file-one',
        action: 'complete' as const,
      },
      {
        scope: 'relation:attachments',
        recordId: 'order-two',
        fileId: 'file-one',
        action: 'complete' as const,
      },
      {
        scope: 'relation:attachments',
        recordId: 'order-one',
        fileId: 'file-two',
        action: 'complete' as const,
      },
      {
        scope: 'relation:attachments',
        recordId: 'order-one',
        fileId: 'file-one',
        action: 'cancel' as const,
      },
    ]) {
      expect(() => codec.verify(input, credential)).toThrow(
        InvalidScopedFileCapabilityError,
      );
    }

    const expired = createScopedFileCapabilityCodec({
      audience: 'app-one',
      secret,
      clock: () => new Date(now.getTime() + 120_000),
    });
    expect(() =>
      expired.verify(
        {
          scope: 'relation:attachments',
          recordId: 'order-one',
          fileId: 'file-one',
          action: 'complete',
        },
        credential,
      ),
    ).toThrow(ExpiredScopedFileCapabilityError);
  });
});
