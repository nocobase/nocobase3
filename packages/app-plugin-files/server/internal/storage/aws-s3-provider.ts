import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { FilesS3StorageConfig } from '../../config.js';
import type {
  S3Provider,
  SignedReadOptions,
  SignedUploadOptions,
  StorageObjectMetadata,
} from './types.js';

export function createAwsS3ClientConfig(
  config: FilesS3StorageConfig,
): S3ClientConfig {
  return {
    requestChecksumCalculation: 'WHEN_REQUIRED',
    ...(config.region === undefined ? {} : { region: config.region }),
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    ...(config.forcePathStyle === undefined
      ? {}
      : { forcePathStyle: config.forcePathStyle }),
    ...(config.credentials === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: config.credentials.accessKeyId,
            secretAccessKey: config.credentials.secretAccessKey,
            ...(config.credentials.sessionToken === undefined
              ? {}
              : { sessionToken: config.credentials.sessionToken }),
          },
        }),
  };
}

export class AwsS3Provider implements S3Provider {
  readonly #bucket: string;
  readonly #client: S3Client;

  constructor(config: FilesS3StorageConfig) {
    this.#bucket = config.bucket;
    this.#client = new S3Client(createAwsS3ClientConfig(config));
  }

  async createUploadUrl(
    key: string,
    options: SignedUploadOptions,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ContentLength: options.contentLength,
      IfNoneMatch: '*',
      ...(options.contentType === undefined
        ? {}
        : { ContentType: options.contentType }),
    });
    return getSignedUrl(this.#client, command, {
      expiresIn: options.expiresInSeconds,
    });
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    const result = await this.#client.send(
      new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
    );
    if (result.ContentLength === undefined) {
      throw new Error('S3 object metadata is missing ContentLength.');
    }

    return {
      contentLength: result.ContentLength,
      ...(result.ContentType === undefined
        ? {}
        : { contentType: result.ContentType }),
      ...(result.ETag === undefined ? {} : { etag: result.ETag }),
      ...(result.LastModified === undefined
        ? {}
        : { lastModified: result.LastModified }),
    };
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    await this.#client.send(
      new CopyObjectCommand({
        Bucket: this.#bucket,
        Key: destinationKey,
        CopySource: encodeCopySource(this.#bucket, sourceKey),
        IfNoneMatch: '*',
      }),
    );
  }

  async createReadUrl(
    key: string,
    options: SignedReadOptions,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ...(options.contentDisposition === undefined
        ? {}
        : { ResponseContentDisposition: options.contentDisposition }),
    });
    return getSignedUrl(this.#client, command, {
      expiresIn: options.expiresInSeconds,
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }),
    );
  }

  dispose(): void {
    this.#client.destroy();
  }
}

function encodeCopySource(bucket: string, key: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${encodeURIComponent(bucket)}/${encodedKey}`;
}
