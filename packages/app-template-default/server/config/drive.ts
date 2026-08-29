import { defineConfig } from '@nocobase/app-server-kit/config';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';
import type { AppDriveConfig, DriveVisibility } from '@nocobase/drive';
import type {
  AppConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';

const driveConfig: AppRuntimeConfigFactory<
  AppDriveConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineConfig<AppDriveConfig, DefaultAppConfigContext>(
  ({ env, paths, mode }): AppDriveConfig => {
    const disks: AppDriveConfig['disks'] = {
      local: {
        driver: 'fs',
        location: paths.storage('app/private'),
        visibility: 'private',
      },

      public: {
        driver: 'fs',
        location: paths.storage('app/public'),
        visibility: 'public',
        url: env.string('DRIVE_PUBLIC_URL', '/storage'),
      },
    };

    const s3Bucket = env.string('AWS_BUCKET');
    if (s3Bucket) {
      disks.s3 = {
        driver: 's3',
        bucket: s3Bucket,
        region: env.string('AWS_DEFAULT_REGION', 'us-east-1'),
        endpoint: env.string('AWS_ENDPOINT'),
        cdnUrl: env.string('AWS_URL'),
        forcePathStyle: env.boolean('AWS_USE_PATH_STYLE_ENDPOINT', false),
        supportsACL: env.boolean('AWS_SUPPORTS_ACL', true),
        encryption: env.string('AWS_SERVER_SIDE_ENCRYPTION'),
        credentials: {
          accessKeyId: env.string('AWS_ACCESS_KEY_ID'),
          secretAccessKey: env.string('AWS_SECRET_ACCESS_KEY'),
        },
        visibility: resolveVisibility(env.string('AWS_VISIBILITY'), 'private'),
      };
    }

    return {
      default: env.string('DRIVE_DISK', 'local'),
      disks,
      links:
        mode === 'embedded'
          ? {}
          : {
              [paths.root('public/storage')]: paths.storage('app/public'),
            },
    };
  },
);

export default driveConfig;

function resolveVisibility(
  value: string | undefined,
  fallback: DriveVisibility,
): DriveVisibility {
  if (value === 'public' || value === 'private') {
    return value;
  }

  return fallback;
}
