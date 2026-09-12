import { type AppDriveConfig } from '@nocobase/drive';
import { Type } from '@sinclair/typebox';
import { envBoolean, envString } from '../config/index.js';

import { defineAppConfig, type AppConfigDefinition } from '../config/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/index.js';

export const driveConfig: AppConfigDefinition<
  AppDriveConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'drive',
  schema: Type.Object({
    default: Type.String(),
    disks: Type.Unsafe<AppDriveConfig['disks']>(
      Type.Record(
        Type.String(),
        Type.Object(
          {
            driver: Type.String(),
            location: Type.Optional(Type.String()),
            visibility: Type.Optional(
              Type.Union([Type.Literal('public'), Type.Literal('private')]),
            ),
            url: Type.Optional(Type.String()),
            bucket: Type.Optional(Type.String()),
            region: Type.Optional(Type.String()),
            endpoint: Type.Optional(Type.String()),
            cdnUrl: Type.Optional(Type.String()),
            forcePathStyle: Type.Optional(Type.Boolean()),
            supportsACL: Type.Optional(Type.Boolean()),
            encryption: Type.Optional(Type.String()),
            credentials: Type.Optional(
              Type.Object(
                {
                  accessKeyId: Type.Optional(Type.String()),
                  secretAccessKey: Type.Optional(Type.String()),
                },
                { additionalProperties: false },
              ),
            ),
          },
          { additionalProperties: true },
        ),
      ),
    ),
  }),
  defaults: ({ paths }) => {
    const disks: AppDriveConfig['disks'] = {
      local: {
        driver: 'fs',
        location: paths.storage(),
        visibility: 'private',
      },
      s3: {
        driver: 's3',
        bucket: '',
        region: 'us-east-1',
        forcePathStyle: false,
        supportsACL: true,
        credentials: {},
        visibility: 'private',
      },
    };
    return {
      default: 'local',
      disks,
    };
  },
  envMappings: {
    DRIVE_DISK: envString('default'),
    DRIVE_PUBLIC_URL: envString('disks.public.url'),
    AWS_BUCKET: envString('disks.s3.bucket'),
    AWS_DEFAULT_REGION: envString('disks.s3.region'),
    AWS_ENDPOINT: envString('disks.s3.endpoint'),
    AWS_URL: envString('disks.s3.cdnUrl'),
    AWS_USE_PATH_STYLE_ENDPOINT: envBoolean('disks.s3.forcePathStyle'),
    AWS_SUPPORTS_ACL: envBoolean('disks.s3.supportsACL'),
    AWS_SERVER_SIDE_ENCRYPTION: envString('disks.s3.encryption'),
    AWS_ACCESS_KEY_ID: envString('disks.s3.credentials.accessKeyId'),
    AWS_SECRET_ACCESS_KEY: envString('disks.s3.credentials.secretAccessKey'),
    AWS_VISIBILITY: envString('disks.s3.visibility'),
  },
});
