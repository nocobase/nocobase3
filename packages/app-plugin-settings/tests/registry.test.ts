import { createAppClient } from '@nocobase/app-sdk';
import { describe, expect, it } from 'vitest';

import {
  createDefaultAppSettingsModuleRegistry,
  getOrCreateAppSettingsModuleRegistry,
  registerAppSettingsModule,
  registerDefaultAppSettingsModules,
} from '../client/registry.js';
import {
  configureAppSettings,
  createAppSettingsConfigurationStore,
  getAppSettingsConfiguration,
} from '../client/configuration.js';

describe('app settings registry', () => {
  it('provides the shared preview capability map', () => {
    const registry = createDefaultAppSettingsModuleRegistry();

    expect(registry.list().map((module) => module.id)).toEqual([
      'users',
      'roles',
      'permissions',
      'data-sources',
      'files',
      'notifications',
      'workflows',
      'knowledge-base',
      'general',
    ]);
  });

  it('lets an installed capability replace its placeholder', () => {
    const registry = createDefaultAppSettingsModuleRegistry();

    registry.register('@nocobase/app-plugin-data-source', {
      id: 'data-sources',
      title: '数据源',
      description: '真实数据源管理',
      group: '数据与集成',
      status: '已接入',
      owner: '数据源模块',
      boundary: '管理真实连接。',
      icon: 'database',
    });

    expect(registry.get('data-sources')).toMatchObject({
      description: '真实数据源管理',
      packageName: '@nocobase/app-plugin-data-source',
      placeholder: false,
      status: '已接入',
    });
  });

  it('is repeatable for one owner and rejects competing owners', () => {
    const registry = createDefaultAppSettingsModuleRegistry();
    const definition = {
      id: 'data-sources',
      title: '数据源',
      description: '真实数据源管理',
      group: '数据与集成' as const,
      status: '已接入' as const,
      owner: '数据源模块',
      boundary: '管理真实连接。',
      icon: 'database' as const,
    };

    registry.register('@nocobase/app-plugin-data-source', definition);
    registry.register('@nocobase/app-plugin-data-source', definition);

    expect(() =>
      registry.register('@nocobase/app-plugin-other', definition),
    ).toThrow('already registered');
  });

  it('uses one app-scoped registry regardless of bootstrap order', () => {
    const client = createAppClient({ fetch: async () => new Response() });

    registerAppSettingsModule(client, '@nocobase/app-plugin-data-source', {
      id: 'data-sources',
      title: '数据源',
      description: '真实数据源管理',
      group: '数据与集成',
      status: '已接入',
      owner: '数据源模块',
      boundary: '管理真实连接。',
      icon: 'database',
    });
    registerDefaultAppSettingsModules(client);

    const registry = getOrCreateAppSettingsModuleRegistry(client);
    expect(registry.get('data-sources')?.status).toBe('已接入');
    expect(registry.list()).toHaveLength(9);
  });
});

describe('app settings configuration', () => {
  it('keeps App presentation configuration in the App-scoped client', () => {
    const orders = createAppClient({ fetch: async () => new Response() });
    const serviceDesk = createAppClient({ fetch: async () => new Response() });

    configureAppSettings(orders, {
      appName: '订单运营中心',
      returnPath: '/dashboard',
    });
    configureAppSettings(serviceDesk, {
      appName: '客户服务中心',
      returnPath: '/tickets',
    });

    expect(getAppSettingsConfiguration(orders)).toEqual({
      appName: '订单运营中心',
      basePath: '/settings',
      returnPath: '/dashboard',
    });
    expect(getAppSettingsConfiguration(serviceDesk)).toEqual({
      appName: '客户服务中心',
      basePath: '/settings',
      returnPath: '/tickets',
    });
  });

  it('normalizes paths and is repeatable for the same desired state', () => {
    const store = createAppSettingsConfigurationStore();
    const first = store.configure({
      appName: ' CRM ',
      returnPath: '/dashboard/',
    });
    const second = store.configure({
      appName: 'CRM',
      basePath: '/settings',
      returnPath: '/dashboard',
    });

    expect(second).toBe(first);
    expect(second).toEqual({
      appName: 'CRM',
      basePath: '/settings',
      returnPath: '/dashboard',
    });
  });

  it('rejects cross-origin paths', () => {
    const store = createAppSettingsConfigurationStore();
    expect(() =>
      store.configure({
        appName: 'CRM',
        returnPath: 'https://example.com',
      }),
    ).toThrow('App-local path');
  });

  it('rejects competing application configuration', () => {
    const store = createAppSettingsConfigurationStore();
    store.configure({ appName: 'CRM', returnPath: '/dashboard' });

    expect(() =>
      store.configure({ appName: 'Orders', returnPath: '/dashboard' }),
    ).toThrow('already registered');
  });
});
