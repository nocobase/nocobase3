import { DriveManager } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Driver } from 'flydrive/drivers/s3';
import { describe, expect, it } from 'vitest';

import { assertDefaultDisk, createDriveManager, type AppDriveConfig } from '../src/index.js';

describe('createDriveManager', () => {
  it('maps declarative drive config to Flydrive services', async () => {
    const manager = createDriveManager(createConfig(), {
      fakes: {
        location: '/tmp/fakes',
      },
    });

    expect(manager).toBeInstanceOf(DriveManager);

    const publicDriver = manager.use('public').driver as FSDriver;
    const s3Driver = manager.use('s3').driver as S3Driver;

    expect(publicDriver).toBeInstanceOf(FSDriver);
    expect(publicDriver.options.location).toBe('/tmp/storage/public');
    expect(await publicDriver.getUrl('a b.txt')).toBe('/storage/a%20b.txt');

    expect(s3Driver).toBeInstanceOf(S3Driver);
    expect(s3Driver.options).toEqual({
      bucket: 'portal-assets',
      region: 'ap-southeast-1',
      endpoint: 'https://s3.example.com',
      cdnUrl: 'https://cdn.example.com',
      forcePathStyle: true,
      supportsACL: false,
      encryption: 'AES256',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
      },
      visibility: 'private',
    });
  });

  it('uses provider credentials when explicit S3 credentials are missing', () => {
    const manager = createDriveManager({
      default: 's3',
      links: {},
      disks: {
        s3: {
          driver: 's3',
          bucket: 'portal-assets',
          region: 'ap-southeast-1',
          forcePathStyle: false,
          supportsACL: true,
          credentials: {},
          visibility: 'private',
        },
      },
    });

    const s3Driver = manager.use('s3').driver as S3Driver;

    expect(s3Driver.options).not.toHaveProperty('credentials');
  });

  it('throws when the default disk is missing', () => {
    expect(() =>
      createDriveManager({
        default: 'missing',
        links: {},
        disks: {},
      }),
    ).toThrow('Default drive disk "missing" is not configured.');
  });
});

describe('assertDefaultDisk', () => {
  it('accepts a configured default disk', () => {
    expect(() => assertDefaultDisk(createConfig())).not.toThrow();
  });
});

function createConfig(): AppDriveConfig {
  return {
    default: 'public',
    links: {
      '/tmp/app/public/storage': '/tmp/storage/public',
    },
    disks: {
      public: {
        driver: 'fs',
        location: '/tmp/storage/public',
        visibility: 'public',
        url: '/storage',
      },
      s3: {
        driver: 's3',
        bucket: 'portal-assets',
        region: 'ap-southeast-1',
        endpoint: 'https://s3.example.com',
        cdnUrl: 'https://cdn.example.com',
        forcePathStyle: true,
        supportsACL: false,
        encryption: 'AES256',
        credentials: {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
        },
        visibility: 'private',
      },
    },
  };
}
