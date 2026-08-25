import { describe, expect, it } from 'vitest';

import {
  groupSettingsModulesByScope,
  settingsModules,
} from '../../client/features/settings/registry';
import {
  defaultStorageDraft,
  validateStorageDraft,
} from '../../client/features/settings/storage-validation';

describe('settings registry', () => {
  it('registers every module once and groups it by its declared scope', () => {
    const groups = groupSettingsModulesByScope(settingsModules);
    const moduleIds = settingsModules.map((module) => module.id);

    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(groups.hub.map((module) => module.id)).toContain(
      'release-management',
    );
    expect(groups.app.map((module) => module.id)).toContain('file-storage');
    expect(groups.user.map((module) => module.id)).toContain(
      'user-preferences',
    );
    expect(
      settingsModules.every(
        (module) => module.configVersion > 0 && Boolean(module.permission),
      ),
    ).toBe(true);
  });
});

describe('storage settings validation', () => {
  it('accepts the local storage prototype defaults', () => {
    expect(validateStorageDraft(defaultStorageDraft)).toEqual({
      valid: true,
      errors: {},
    });
  });

  it('requires S3 credentials and rejects a non-http endpoint', () => {
    const result = validateStorageDraft({
      ...defaultStorageDraft,
      driver: 's3',
      endpoint: 'internal-service.local',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({
      endpoint: 'Endpoint 需要是有效的 HTTP(S) URL',
      region: '请填写 Region',
      bucket: '请填写 Bucket',
      accessKeyId: '请填写 Access Key ID',
      secretAccessKey: '请填写 Secret Access Key',
    });
  });
});
