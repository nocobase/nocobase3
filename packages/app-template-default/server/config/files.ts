import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import {
  resolveFilesConfig,
  type FilesConfig,
} from '@nocobase/app-plugin-files/server';

const filesConfig: ConfigFactory<FilesConfig> = defineConfig(
  ({ env, paths }): FilesConfig => {
    const driver = env.string('FILES_STORAGE_DRIVER', 'local');
    const accessKeyId = env.string('FILES_S3_ACCESS_KEY_ID');
    const secretAccessKey = env.string('FILES_S3_SECRET_ACCESS_KEY');
    const sessionToken = env.string('FILES_S3_SESSION_TOKEN');
    const credentialsConfigured =
      accessKeyId !== undefined ||
      secretAccessKey !== undefined ||
      sessionToken !== undefined;

    return resolveFilesConfig({
      appStorageRoot: paths.storage(),
      publicRoots: [paths.root('public'), paths.root('dist/client')],
      config: {
        storage:
          driver === 'local'
            ? {
                driver,
                root: env.string('FILES_LOCAL_ROOT'),
              }
            : {
                driver,
                bucket: env.string('FILES_S3_BUCKET'),
                region: env.string('FILES_S3_REGION'),
                endpoint: env.string('FILES_S3_ENDPOINT'),
                prefix: env.string('FILES_S3_PREFIX'),
                forcePathStyle: env.boolean('FILES_S3_FORCE_PATH_STYLE'),
                credentials: credentialsConfigured
                  ? {
                      accessKeyId,
                      secretAccessKey,
                      sessionToken,
                    }
                  : undefined,
              },
        upload: {
          maxBytes: env.number('FILES_UPLOAD_MAX_BYTES'),
          expiresInSeconds: env.number('FILES_UPLOAD_EXPIRES_IN_SECONDS'),
        },
        access: {
          temporaryExpiresInSeconds: env.number(
            'FILES_TEMPORARY_ACCESS_EXPIRES_IN_SECONDS',
          ),
          providerUrlExpiresInSeconds: env.number(
            'FILES_PROVIDER_URL_EXPIRES_IN_SECONDS',
          ),
        },
        publicAccess: {
          enabled: env.boolean('FILES_PUBLIC_ACCESS_ENABLED'),
        },
      },
    });
  },
);

export default filesConfig;
