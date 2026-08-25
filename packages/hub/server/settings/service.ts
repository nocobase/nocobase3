import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import path from 'node:path';

import { SettingsError } from './errors.js';
import type { SettingsSecretBox } from './crypto.js';
import type { SettingsStore } from './store.js';
import type {
  SettingsActor,
  StorageSettingsDraft,
  StorageSettingsPublic,
  StorageSettingsRecord,
} from './types.js';

const MODULE_ID = 'file-storage' as const;

export interface StorageTestResult {
  ok: true;
  message: string;
}

export class SettingsService {
  constructor(
    private readonly store: SettingsStore,
    private readonly secretBox: SettingsSecretBox | undefined = undefined,
  ) {}

  async getStorage(
    appId: string,
    actor: SettingsActor,
  ): Promise<StorageSettingsPublic | null> {
    const record = await this.store.getStorage(appId);
    await this.audit({ appId, action: 'read', status: 'succeeded', actor });
    return record ? toPublic(record) : null;
  }

  async saveStorage(
    appId: string,
    draft: StorageSettingsDraft,
    actor: SettingsActor,
  ): Promise<StorageSettingsPublic> {
    try {
      const existing = await this.store.getStorage(appId);
      const normalized = await this.normalize(appId, draft, existing);
      const record: StorageSettingsRecord = {
        ...normalized,
        status: 'saved',
        applyStatus: 'pending-runtime-apply',
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };
      await this.store.saveStorage(record, {
        appId,
        moduleId: MODULE_ID,
        action: 'save',
        status: 'succeeded',
        actor,
        at: record.updatedAt,
      });
      return toPublic(record);
    } catch (error) {
      await this.audit({
        appId,
        action: 'save',
        status: 'failed',
        actor,
        errorCode:
          error instanceof SettingsError ? error.code : 'SETTINGS_SAVE_FAILED',
      });
      throw error;
    }
  }

  async testStorage(
    appId: string,
    draft: StorageSettingsDraft,
    actor: SettingsActor,
  ): Promise<StorageTestResult> {
    try {
      const existing = await this.store.getStorage(appId);
      await this.normalize(appId, draft, existing);
      await this.audit({ appId, action: 'test', status: 'succeeded', actor });
      return {
        ok: true,
        message: '字段与 Endpoint 安全校验通过，尚未执行外部存储连通性测试。',
      };
    } catch (error) {
      await this.audit({
        appId,
        action: 'test',
        status: 'failed',
        actor,
        errorCode:
          error instanceof SettingsError ? error.code : 'SETTINGS_TEST_FAILED',
      });
      throw error;
    }
  }

  private async normalize(
    appId: string,
    draft: StorageSettingsDraft,
    existing: StorageSettingsRecord | null,
  ): Promise<
    Omit<
      StorageSettingsRecord,
      'status' | 'applyStatus' | 'updatedAt' | 'updatedBy'
    >
  > {
    assertAppId(appId);
    const value = validateDraft(draft);
    let credentialsEncrypted =
      existing?.driver === 's3' ? existing.credentialsEncrypted : null;

    if (value.driver === 's3') {
      await assertSafeEndpoint(value.endpoint);
      if (!this.secretBox) {
        throw new SettingsError(
          '未配置服务端密钥，无法安全读取或保存 S3 凭证',
          {
            status: 503,
            code: 'SETTINGS_ENCRYPTION_NOT_CONFIGURED',
          },
        );
      }
      const previous = credentialsEncrypted
        ? readCredentials(this.secretBox.decrypt(credentialsEncrypted))
        : { accessKeyId: '', secretAccessKey: '' };
      if (value.accessKeyId || value.secretAccessKey) {
        const credentials = {
          accessKeyId: value.accessKeyId || previous.accessKeyId,
          secretAccessKey: value.secretAccessKey || previous.secretAccessKey,
        };
        if (!credentials.accessKeyId) {
          throw new SettingsError('请填写 Access Key ID', {
            status: 400,
            code: 'SETTINGS_ACCESS_KEY_REQUIRED',
          });
        }
        if (!credentials.secretAccessKey) {
          throw new SettingsError('请填写 Secret Access Key', {
            status: 400,
            code: 'SETTINGS_SECRET_REQUIRED',
          });
        }
        credentialsEncrypted = this.secretBox.encrypt(
          JSON.stringify(credentials),
        );
      }
      if (!credentialsEncrypted) {
        throw new SettingsError('请填写 S3 访问凭证', {
          status: 400,
          code: 'SETTINGS_CREDENTIALS_REQUIRED',
        });
      }
    } else {
      credentialsEncrypted = null;
    }

    return {
      appId,
      moduleId: MODULE_ID,
      name: value.name,
      driver: value.driver,
      visibility: value.visibility,
      isDefault: value.isDefault,
      localPath: value.localPath,
      publicUrl: value.publicUrl,
      endpoint: value.endpoint,
      region: value.region,
      bucket: value.bucket,
      forcePathStyle: value.forcePathStyle,
      supportsAcl: value.supportsAcl,
      credentialsEncrypted,
      configVersion: 1,
    };
  }

  private async audit(
    input: Omit<Parameters<SettingsStore['appendAudit']>[0], 'at' | 'moduleId'>,
  ): Promise<void> {
    try {
      await this.store.appendAudit({
        ...input,
        moduleId: MODULE_ID,
        at: new Date().toISOString(),
      });
    } catch {
      // A failed audit must not turn a successful read into a false success. The
      // store itself is the same atomic file, so errors are surfaced on writes.
      if (input.action !== 'read') {
        throw new SettingsError('配置审计写入失败', {
          status: 503,
          code: 'SETTINGS_AUDIT_WRITE_FAILED',
        });
      }
    }
  }
}

function toPublic(record: StorageSettingsRecord): StorageSettingsPublic {
  return {
    appId: record.appId,
    moduleId: MODULE_ID,
    name: record.name,
    driver: record.driver,
    visibility: record.visibility,
    isDefault: record.isDefault,
    localPath: record.localPath,
    publicUrl: record.publicUrl,
    endpoint: record.endpoint,
    region: record.region,
    bucket: record.bucket,
    accessKeyId: '',
    accessKeyIdConfigured: Boolean(record.credentialsEncrypted),
    secretAccessKey: '',
    secretConfigured: Boolean(record.credentialsEncrypted),
    forcePathStyle: record.forcePathStyle,
    supportsAcl: record.supportsAcl,
    configVersion: record.configVersion,
    status: record.status,
    applyStatus: record.applyStatus,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

function validateDraft(draft: StorageSettingsDraft): StorageSettingsDraft {
  if (!draft || typeof draft !== 'object') {
    throw new SettingsError('配置内容无效', {
      status: 400,
      code: 'SETTINGS_INVALID_BODY',
    });
  }

  const value: StorageSettingsDraft = {
    name: stringValue(draft.name, 'name', 128),
    driver:
      draft.driver === 'fs' || draft.driver === 's3'
        ? draft.driver
        : invalid('driver'),
    visibility:
      draft.visibility === 'public' || draft.visibility === 'private'
        ? draft.visibility
        : invalid('visibility'),
    isDefault: booleanValue(draft.isDefault, 'isDefault'),
    localPath: stringValue(draft.localPath, 'localPath', 1024),
    publicUrl: stringValue(draft.publicUrl, 'publicUrl', 2048),
    endpoint: stringValue(draft.endpoint, 'endpoint', 2048),
    region: stringValue(draft.region, 'region', 128),
    bucket: stringValue(draft.bucket, 'bucket', 255),
    accessKeyId: stringValue(draft.accessKeyId, 'accessKeyId', 255),
    secretAccessKey: stringValue(
      draft.secretAccessKey,
      'secretAccessKey',
      2048,
    ),
    forcePathStyle: booleanValue(draft.forcePathStyle, 'forcePathStyle'),
    supportsAcl: booleanValue(draft.supportsAcl, 'supportsAcl'),
  };

  if (!value.name.trim()) invalid('name');
  if (value.driver === 'fs' && !isSafeRelativeStoragePath(value.localPath)) {
    throw new SettingsError('本地目录必须是安全的相对路径', {
      status: 400,
      code: 'SETTINGS_LOCAL_PATH_INVALID',
    });
  }
  if (value.driver === 's3') {
    if (!value.region.trim()) invalid('region');
    if (!value.bucket.trim()) invalid('bucket');
  }
  if (
    value.publicUrl &&
    !value.publicUrl.startsWith('/') &&
    !isHttpUrl(value.publicUrl)
  ) {
    throw new SettingsError('公开地址需要是绝对路径或 HTTP(S) URL', {
      status: 400,
      code: 'SETTINGS_PUBLIC_URL_INVALID',
    });
  }
  return value;
}

async function assertSafeEndpoint(value: string): Promise<void> {
  if (!value.trim()) return;
  if (!isHttpUrl(value)) {
    throw new SettingsError('Endpoint 需要是有效的 HTTP(S) URL', {
      status: 400,
      code: 'SETTINGS_ENDPOINT_INVALID',
    });
  }
  const hostname = normalizeHostname(new URL(value).hostname);
  if (isBlockedHost(hostname)) blockedEndpoint();
  if (!isIP(hostname)) {
    try {
      const addresses = await lookup(hostname, { all: true });
      if (addresses.some((address) => isBlockedHost(address.address))) {
        blockedEndpoint();
      }
    } catch (error) {
      throw new SettingsError('无法解析 Endpoint 主机', {
        status: 400,
        code: 'SETTINGS_ENDPOINT_UNRESOLVED',
        cause: error,
      });
    }
  }
}

function blockedEndpoint(): never {
  throw new SettingsError('Endpoint 指向内网或本机地址，已阻止请求', {
    status: 400,
    code: 'SETTINGS_SSRF_BLOCKED',
  });
}

function isBlockedHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal'))
    return true;
  if (isIP(hostname) === 4) {
    const [a, b] = hostname.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(hostname) === 6) {
    if (hostname.startsWith('::ffff:')) {
      return isBlockedHost(hostname.slice('::ffff:'.length));
    }
    return (
      hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe8') ||
      hostname.startsWith('fe9') ||
      hostname.startsWith('fea') ||
      hostname.startsWith('feb') ||
      hostname.startsWith('ff')
    );
  }
  return false;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '');
}

function isSafeRelativeStoragePath(value: string): boolean {
  if (!value || value.includes('\0')) return false;
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value))
    return false;
  return !value.split(/[\\/]+/).includes('..');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function stringValue(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) invalid(field);
  return value.trim();
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(field);
  return value;
}

function invalid(field: string): never {
  throw new SettingsError(`配置字段 ${field} 无效`, {
    status: 400,
    code: 'SETTINGS_INVALID_FIELD',
  });
}

function assertAppId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new SettingsError('App ID 无效', {
      status: 400,
      code: 'SETTINGS_APP_ID_INVALID',
    });
  }
}

function readCredentials(value: string): {
  accessKeyId: string;
  secretAccessKey: string;
} {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.accessKeyId === 'string' &&
      typeof parsed.secretAccessKey === 'string'
    ) {
      return {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
      };
    }
  } catch {
    // Report one stable server-side error without including credential data.
  }
  throw new SettingsError('已保存的 S3 凭证格式无效', {
    status: 500,
    code: 'SETTINGS_CREDENTIALS_INVALID',
  });
}
