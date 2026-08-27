import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ExpiredFileTokenError,
  InvalidFileInputError,
  InvalidFileTokenError,
} from '../server/errors.js';
import {
  DEFAULT_FILE_TOKEN_TTL_SECONDS,
  issueFileToken,
  MAX_FILE_TOKEN_TTL_SECONDS,
  verifyFileToken,
} from '../server/token.js';

const SECRET = 'unit-test-file-token-secret';

describe('file access tokens', () => {
  it('round trips with the default TTL', () => {
    const issued = issueFileToken({
      secret: SECRET,
      audience: 'orders',
      fileId: 'file-1',
      now: 1_000,
    });

    expect(issued.expiresAt).toBe(1_000 + DEFAULT_FILE_TOKEN_TTL_SECONDS);
    expect(
      verifyFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-1',
        token: issued.token,
        now: 1_001,
      }),
    ).toEqual({
      version: 1,
      audience: 'orders',
      fileId: 'file-1',
      expiresAt: 1_000 + DEFAULT_FILE_TOKEN_TTL_SECONDS,
    });
  });

  it('supports custom and maximum valid TTL values', () => {
    expect(
      issueFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-1',
        expiresIn: 30,
        now: 100,
      }).expiresAt,
    ).toBe(130);
    expect(
      issueFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-1',
        expiresIn: MAX_FILE_TOKEN_TTL_SECONDS,
        now: 100,
      }).expiresAt,
    ).toBe(100 + MAX_FILE_TOKEN_TTL_SECONDS);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 86_401])(
    'rejects invalid TTL %s',
    (expiresIn) => {
      expect(() =>
        issueFileToken({
          secret: SECRET,
          audience: 'orders',
          fileId: 'file-1',
          expiresIn,
          now: 100,
        }),
      ).toThrow(InvalidFileInputError);
    },
  );

  it('rejects expired tokens', () => {
    const issued = issueFileToken({
      secret: SECRET,
      audience: 'orders',
      fileId: 'file-1',
      expiresIn: 1,
      now: 100,
    });

    expect(() =>
      verifyFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-1',
        token: issued.token,
        now: 101,
      }),
    ).toThrow(ExpiredFileTokenError);
  });

  it('rejects changed payloads and signatures through a generic error', () => {
    const issued = issueFileToken({
      secret: SECRET,
      audience: 'orders',
      fileId: 'file-1',
      now: 100,
    });
    const [payload, signature] = issued.token.split('.');
    const changedPayload = Buffer.from(
      JSON.stringify({
        version: 1,
        audience: 'orders',
        fileId: 'file-2',
        expiresAt: 1_000,
      }),
    ).toString('base64url');
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;

    for (const token of [
      `${changedPayload}.${signature}`,
      `${payload}.${changedSignature}`,
    ]) {
      let error: unknown;
      try {
        verifyFileToken({
          secret: SECRET,
          audience: 'orders',
          fileId: 'file-1',
          token,
          now: 101,
        });
      } catch (cause) {
        error = cause;
      }

      expect(error).toBeInstanceOf(InvalidFileTokenError);
      expect((error as Error).message).not.toContain(SECRET);
      expect((error as Error).message).not.toContain(token);
    }
  });

  it('uses the fixed-length comparison path for a short signature', () => {
    const issued = issueFileToken({
      secret: SECRET,
      audience: 'orders',
      fileId: 'file-1',
      now: 100,
    });
    const [payload] = issued.token.split('.');

    expect(() =>
      verifyFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-1',
        token: `${payload}.AA`,
        now: 101,
      }),
    ).toThrow(InvalidFileTokenError);
  });

  it('rejects wrong audience and file ID', () => {
    const issued = issueFileToken({
      secret: SECRET,
      audience: 'orders',
      fileId: 'file-1',
      now: 100,
    });

    expect(() =>
      verifyFileToken({
        secret: SECRET,
        audience: 'profiles',
        fileId: 'file-1',
        token: issued.token,
        now: 101,
      }),
    ).toThrow(InvalidFileTokenError);
    expect(() =>
      verifyFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-2',
        token: issued.token,
        now: 101,
      }),
    ).toThrow(InvalidFileTokenError);
  });

  it.each(['', 'one-part', 'a.b.c', '***.value', 'value.***'])(
    'rejects malformed token %s',
    (token) => {
      expect(() =>
        verifyFileToken({
          secret: SECRET,
          audience: 'orders',
          fileId: 'file-1',
          token,
          now: 100,
        }),
      ).toThrow(InvalidFileTokenError);
    },
  );

  it('rejects a signed payload with an invalid contract', () => {
    const payload = Buffer.from(
      JSON.stringify({
        version: 2,
        audience: 'orders',
        fileId: 'file-1',
        expiresAt: 1_000,
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', SECRET)
      .update(payload)
      .digest('base64url');

    expect(() =>
      verifyFileToken({
        secret: SECRET,
        audience: 'orders',
        fileId: 'file-1',
        token: `${payload}.${signature}`,
        now: 100,
      }),
    ).toThrow(InvalidFileTokenError);
  });
});
