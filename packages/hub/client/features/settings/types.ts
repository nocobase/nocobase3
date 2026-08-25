export type SettingsScope = 'hub' | 'app' | 'user';

export type SettingsCategory =
  'application' | 'integration' | 'security' | 'operations' | 'personal';

export type SettingsModuleStatus = 'available' | 'prototype' | 'planned';

export type SettingsApplyMode = 'immediate' | 'restart';

export interface SettingsModuleDefinition {
  id: string;
  title: string;
  description: string;
  scope: SettingsScope;
  category: SettingsCategory;
  status: SettingsModuleStatus;
  capabilities: readonly string[];
  permission: string;
  configVersion: number;
  applyMode: SettingsApplyMode;
  path?: string;
  containsSecrets?: boolean;
  supportsConnectionTest?: boolean;
}

export type StorageDriver = 'fs' | 's3';

export interface StorageSettingsDraft {
  name: string;
  driver: StorageDriver;
  visibility: 'public' | 'private';
  isDefault: boolean;
  localPath: string;
  publicUrl: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  supportsAcl: boolean;
}

export interface StorageSettingsResponse extends Omit<
  StorageSettingsDraft,
  'secretAccessKey' | 'accessKeyId'
> {
  appId: string;
  moduleId: 'file-storage';
  accessKeyId: string;
  accessKeyIdConfigured: boolean;
  secretAccessKey: '';
  secretConfigured: boolean;
  configVersion: number;
  status: 'saved';
  applyStatus: 'pending-runtime-apply';
  updatedAt: string;
  updatedBy: { id: string; name: string; role: string };
}

export interface StorageTestResponse {
  ok: true;
  message: string;
}

export interface StorageValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof StorageSettingsDraft, string>>;
}
