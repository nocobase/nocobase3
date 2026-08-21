import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import type { AppDriveConfig, DriveVisibility } from '@nocobase/drive';

const driveConfig: ConfigFactory<AppDriveConfig> = defineConfig(
  ({ env, paths }): AppDriveConfig => ({
    default: env.string('DRIVE_DISK', 'local'),

    disks: {
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

      s3: {
        driver: 's3',
        bucket: env.string('AWS_BUCKET', ''),
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
      },
    },

    links: {
      [paths.root('public/storage')]: paths.storage('app/public'),
    },
  }),
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
