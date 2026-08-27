import type { StorageSettingsDraft, StorageValidationResult } from './types';

export const defaultStorageDraft: StorageSettingsDraft = {
  name: 'local',
  driver: 'fs',
  visibility: 'public',
  isDefault: true,
  localPath: 'storage/uploads',
  publicUrl: '/storage/uploads',
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
  supportsAcl: true,
};

export function validateStorageDraft(
  draft: StorageSettingsDraft,
  options: {
    accessKeyIdConfigured?: boolean;
    secretAccessKeyConfigured?: boolean;
  } = {},
): StorageValidationResult {
  const errors: StorageValidationResult['errors'] = {};

  if (!draft.name.trim()) {
    errors.name = '请填写存储名称';
  }

  if (draft.driver === 'fs') {
    if (!draft.localPath.trim()) {
      errors.localPath = '请填写本地存储目录';
    }
  } else {
    if (!draft.region.trim()) errors.region = '请填写 Region';
    if (!draft.bucket.trim()) errors.bucket = '请填写 Bucket';
    if (!draft.accessKeyId.trim() && !options.accessKeyIdConfigured) {
      errors.accessKeyId = '请填写 Access Key ID';
    }
    if (!draft.secretAccessKey.trim() && !options.secretAccessKeyConfigured) {
      errors.secretAccessKey = '请填写 Secret Access Key';
    }
    if (draft.endpoint.trim() && !isHttpUrl(draft.endpoint)) {
      errors.endpoint = 'Endpoint 需要是有效的 HTTP(S) URL';
    }
  }

  if (draft.publicUrl.trim() && !isPublicUrl(draft.publicUrl)) {
    errors.publicUrl = '公开地址需要是绝对路径或 HTTP(S) URL';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPublicUrl(value: string): boolean {
  return value.startsWith('/') || isHttpUrl(value);
}
