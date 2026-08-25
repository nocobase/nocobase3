import type { AppClientRefineConfig } from '@nocobase/app-client';
import { dataProvider } from '@nocobase/app-portal-sdk/data';
import { describe, expect, it, vi } from 'vitest';

import { createRefineConfigCollector } from '../../client/refine-runtime.ts';

type RefineAuthProvider = NonNullable<AppClientRefineConfig['authProvider']>;

const authProvider: RefineAuthProvider = {
  check: vi.fn(),
  getIdentity: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  onError: vi.fn(),
};

describe('client refine runtime', () => {
  it('supports every configurable Refine prop through explicit setters', () => {
    const collector = createRefineConfigCollector({});
    const refine = collector.forPlugin('@nocobase/app-plugin-refine');
    const routerProvider: NonNullable<AppClientRefineConfig['routerProvider']> =
      {
        back: () => () => undefined,
      };
    const liveProvider: NonNullable<AppClientRefineConfig['liveProvider']> = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const notificationProvider: NonNullable<
      AppClientRefineConfig['notificationProvider']
    > = {
      close: vi.fn(),
      open: vi.fn(),
    };
    const accessControlProvider: NonNullable<
      AppClientRefineConfig['accessControlProvider']
    > = {
      can: vi.fn(async () => ({ can: true })),
    };
    const auditLogProvider: NonNullable<
      AppClientRefineConfig['auditLogProvider']
    > = {
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
    };
    const i18nProvider: NonNullable<AppClientRefineConfig['i18nProvider']> = {
      changeLocale: vi.fn(),
      getLocale: vi.fn(() => 'en-US'),
      translate: vi.fn((key: string) => key),
    };
    const onLiveEvent = vi.fn();

    refine.setChildren('Configured Refine content');
    refine.setResources([{ name: 'users' }]);
    refine.addResources([{ name: 'posts' }]);
    refine.setRouterProvider(routerProvider);
    refine.setDataProvider(dataProvider);
    refine.setAuthProvider(authProvider);
    refine.setLiveProvider(liveProvider);
    refine.setNotificationProvider(notificationProvider);
    refine.setAccessControlProvider(accessControlProvider);
    refine.setAuditLogProvider(auditLogProvider);
    refine.setI18nProvider(i18nProvider);
    refine.setOnLiveEvent(onLiveEvent);
    refine.setOptions({ mutationMode: 'optimistic' });

    const config = collector.finalize();

    expect(config).toMatchObject({
      accessControlProvider,
      auditLogProvider,
      authProvider,
      children: 'Configured Refine content',
      dataProvider,
      i18nProvider,
      liveProvider,
      notificationProvider,
      options: { mutationMode: 'optimistic' },
      resources: [{ name: 'users' }, { name: 'posts' }],
      routerProvider,
    });
    expect(config.onLiveEvent).toBe(onLiveEvent);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.resources)).toBe(true);
  });

  it('merges defaults and fans out appended live event handlers', () => {
    const defaultHandler = vi.fn();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const collector = createRefineConfigCollector({
      dataProvider,
      onLiveEvent: defaultHandler,
      options: {
        title: { text: 'NocoBase' },
      },
    });

    collector
      .forPlugin('@nocobase/app-plugin-first')
      .addLiveEventHandler(firstHandler);
    const second = collector.forPlugin('@nocobase/app-plugin-second');
    second.addLiveEventHandler(secondHandler);
    second.setOptions({ mutationMode: 'undoable' });

    const config = collector.finalize();
    const event = {
      channel: 'records',
      date: new Date(),
      payload: {},
      type: 'updated',
    };
    config.onLiveEvent?.(event);

    expect(defaultHandler).toHaveBeenCalledExactlyOnceWith(event);
    expect(firstHandler).toHaveBeenCalledExactlyOnceWith(event);
    expect(secondHandler).toHaveBeenCalledExactlyOnceWith(event);
    expect(config.options).toMatchObject({
      mutationMode: 'undoable',
      title: { text: 'NocoBase' },
    });
  });

  it('rejects multiple plugins setting the same Refine prop', () => {
    const collector = createRefineConfigCollector({});
    collector
      .forPlugin('@nocobase/app-plugin-first')
      .setAuthProvider(authProvider);

    expect(() =>
      collector
        .forPlugin('@nocobase/app-plugin-second')
        .setAuthProvider(authProvider),
    ).toThrow(
      'Refine property "authProvider" is already registered by "@nocobase/app-plugin-first"',
    );
  });

  it('closes retained registries after finalization', () => {
    const collector = createRefineConfigCollector({});
    const refine = collector.forPlugin('@nocobase/app-plugin-refine');

    collector.finalize();

    expect(() => refine.addResources([{ name: 'late' }])).toThrow(
      'Refine configuration has already been finalized',
    );
    expect(() => refine.setOptions({ mutationMode: 'optimistic' })).toThrow(
      'Refine configuration has already been finalized',
    );
  });

  it('rejects duplicate resource identifiers across contributions', () => {
    const collector = createRefineConfigCollector({});
    collector
      .forPlugin('@nocobase/app-plugin-first')
      .addResources([{ identifier: 'records', name: 'firstRecords' }]);
    collector
      .forPlugin('@nocobase/app-plugin-second')
      .addResources([{ identifier: 'records', name: 'secondRecords' }]);

    expect(() => collector.finalize()).toThrow(
      'Refine resource "records" is already registered by "@nocobase/app-plugin-first"',
    );
  });
});
