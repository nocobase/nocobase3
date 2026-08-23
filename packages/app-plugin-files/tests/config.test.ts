import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveFilesConfig } from '@nocobase/app-plugin-files/server';

const appStorageRoot = path.resolve('/tmp/nocobase/files-storage');

describe('resolveFilesConfig', () => {
  it('uses a private local root and stable defaults', () => {
    expect(resolveFilesConfig({ appStorageRoot })).toEqual({
      storage: {
        driver: 'local',
        root: path.join(appStorageRoot, 'app/private/files'),
      },
      upload: {
        maxBytes: 50 * 1024 * 1024,
        expiresInSeconds: 15 * 60,
      },
      access: {
        temporaryExpiresInSeconds: 5 * 60,
        providerUrlExpiresInSeconds: 60,
      },
      publicAccess: { enabled: false },
    });
  });

  it('accepts explicit limits and public access policy', () => {
    const config = resolveFilesConfig({
      appStorageRoot,
      config: {
        upload: { maxBytes: 1024, expiresInSeconds: 30 },
        access: {
          temporaryExpiresInSeconds: 20,
          providerUrlExpiresInSeconds: 10,
        },
        publicAccess: { enabled: true },
      },
    });

    expect(config.upload).toEqual({ maxBytes: 1024, expiresInSeconds: 30 });
    expect(config.access).toEqual({
      temporaryExpiresInSeconds: 20,
      providerUrlExpiresInSeconds: 10,
    });
    expect(config.publicAccess.enabled).toBe(true);
  });

  it.each([
    ['upload.maxBytes', { upload: { maxBytes: 0 } }],
    ['upload.expiresInSeconds', { upload: { expiresInSeconds: -1 } }],
    [
      'access.temporaryExpiresInSeconds',
      { access: { temporaryExpiresInSeconds: 1.5 } },
    ],
    [
      'access.providerUrlExpiresInSeconds',
      { access: { providerUrlExpiresInSeconds: Number.MAX_VALUE } },
    ],
  ])('rejects invalid numeric setting %s', (field, config) => {
    expect(() => resolveFilesConfig({ appStorageRoot, config })).toThrow(
      `Invalid Files configuration: ${field} must be a positive safe integer.`,
    );
  });

  it.each([
    ['', 'storage.root must be a non-empty string.'],
    ['relative/files', 'storage.root must be an absolute path.'],
    [
      `${appStorageRoot}/../outside`,
      'storage.root must not contain path traversal.',
    ],
    [
      path.resolve('/tmp/nocobase/public/files'),
      'storage.root must not point to a public static directory.',
    ],
  ])('rejects unsafe local root %j', (root, message) => {
    expect(() =>
      resolveFilesConfig({
        appStorageRoot,
        config: { storage: { driver: 'local', root } },
      }),
    ).toThrow(`Invalid Files configuration: ${message}`);
  });

  it('rejects roots contained by an explicit public directory', () => {
    const publicRoot = path.resolve('/srv/nocobase/assets');
    expect(() =>
      resolveFilesConfig({
        appStorageRoot,
        publicRoots: [publicRoot],
        config: {
          storage: {
            driver: 'local',
            root: path.join(publicRoot, 'files'),
          },
        },
      }),
    ).toThrow(
      'Invalid Files configuration: storage.root must not point to a public static directory.',
    );
  });

  it('maps AWS S3 configuration without adding provider defaults', () => {
    expect(
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: {
            driver: 's3',
            bucket: 'managed-files',
            region: 'ap-southeast-1',
            prefix: '/apps/primary/',
            forcePathStyle: false,
          },
        },
      }).storage,
    ).toEqual({
      driver: 's3',
      bucket: 'managed-files',
      region: 'ap-southeast-1',
      prefix: 'apps/primary',
      forcePathStyle: false,
    });
  });

  it.each([
    [
      'Cloudflare R2',
      {
        region: 'auto',
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
        forcePathStyle: false,
      },
    ],
    [
      'MinIO',
      {
        region: 'us-east-1',
        endpoint: 'http://minio.internal:9000',
        forcePathStyle: true,
      },
    ],
  ])('preserves %s provider differences', (_provider, providerConfig) => {
    const storage = resolveFilesConfig({
      appStorageRoot,
      config: {
        storage: {
          driver: 's3',
          bucket: 'managed-files',
          ...providerConfig,
        },
      },
    }).storage;

    expect(storage).toMatchObject(providerConfig);
  });

  it('preserves complete temporary credentials', () => {
    const storage = resolveFilesConfig({
      appStorageRoot,
      config: {
        storage: {
          driver: 's3',
          bucket: 'managed-files',
          credentials: {
            accessKeyId: 'temporary-access',
            secretAccessKey: 'temporary-secret',
            sessionToken: 'temporary-session',
          },
        },
      },
    }).storage;

    expect(storage).toMatchObject({
      credentials: {
        accessKeyId: 'temporary-access',
        secretAccessKey: 'temporary-secret',
        sessionToken: 'temporary-session',
      },
    });
  });

  it('fails fast for partial credentials without exposing secret values', () => {
    const secret = 'must-not-appear';
    let error: Error | undefined;
    try {
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: {
            driver: 's3',
            bucket: 'managed-files',
            credentials: { secretAccessKey: secret },
          },
        },
      });
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).toBe(
      'Invalid Files configuration: storage.credentials must include both accessKeyId and secretAccessKey.',
    );
    expect(error?.message).not.toContain(secret);
  });

  it('requires an S3 bucket and safe endpoint and prefix values', () => {
    expect(() =>
      resolveFilesConfig({
        appStorageRoot,
        config: { storage: { driver: 's3' } },
      }),
    ).toThrow('Invalid Files configuration: storage.bucket is required.');

    expect(() =>
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: {
            driver: 's3',
            bucket: 'managed-files',
            endpoint: 'https://user:password@s3.example.com',
          },
        },
      }),
    ).toThrow(
      'Invalid Files configuration: storage.endpoint must be an HTTP or HTTPS URL without credentials.',
    );

    expect(() =>
      resolveFilesConfig({
        appStorageRoot,
        config: {
          storage: {
            driver: 's3',
            bucket: 'managed-files',
            prefix: 'apps/../shared',
          },
        },
      }),
    ).toThrow(
      'Invalid Files configuration: storage.prefix must not contain path traversal.',
    );
  });
});
