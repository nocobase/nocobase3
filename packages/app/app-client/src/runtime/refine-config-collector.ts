import type { AppClientRefineConfig } from '../config.js';
import type { AppClientRefineRegistry } from '../plugins.js';

type RefineResources = NonNullable<AppClientRefineConfig['resources']>;
type RefineResource = RefineResources[number];
type RefineLiveEventHandler = NonNullable<AppClientRefineConfig['onLiveEvent']>;
type RefineProperty = keyof AppClientRefineConfig;

interface ResourceContribution {
  readonly owner: string;
  readonly resources: RefineResources;
}

export interface AppClientRefineConfigCollector {
  forContribution(packageName: string): AppClientRefineRegistry;
  finalize(): AppClientRefineConfig;
}

export function createRefineConfigCollector(
  defaults: AppClientRefineConfig,
): AppClientRefineConfigCollector {
  const owners = new Map<RefineProperty, string>();
  const resourceContributions: ResourceContribution[] = [];
  const liveEventHandlers: RefineLiveEventHandler[] = [];
  let finalized = false;
  let children: AppClientRefineConfig['children'];
  let resources: RefineResources | undefined;
  let routerProvider: AppClientRefineConfig['routerProvider'];
  let dataProvider: AppClientRefineConfig['dataProvider'];
  let authProvider: AppClientRefineConfig['authProvider'];
  let liveProvider: AppClientRefineConfig['liveProvider'];
  let notificationProvider: AppClientRefineConfig['notificationProvider'];
  let accessControlProvider: AppClientRefineConfig['accessControlProvider'];
  let auditLogProvider: AppClientRefineConfig['auditLogProvider'];
  let i18nProvider: AppClientRefineConfig['i18nProvider'];
  let onLiveEvent: AppClientRefineConfig['onLiveEvent'];
  let refineOptions: AppClientRefineConfig['options'];

  function assertOpen(): void {
    if (finalized) {
      throw new Error('Refine configuration has already been finalized.');
    }
  }

  function claim(property: RefineProperty, packageName: string): void {
    assertOpen();
    const existingOwner = owners.get(property);
    if (existingOwner) {
      throw new Error(
        `Refine property "${property}" is already registered by ` +
          `"${existingOwner}"; "${packageName}" cannot register it again.`,
      );
    }
    owners.set(property, packageName);
  }

  function forContribution(packageName: string): AppClientRefineRegistry {
    assertOpen();
    return Object.freeze({
      setChildren(
        value: Exclude<AppClientRefineConfig['children'], undefined>,
      ): void {
        claim('children', packageName);
        children = value;
      },
      setResources(value: RefineResources): void {
        claim('resources', packageName);
        resources = freezeResources(value);
      },
      addResources(value: RefineResources): void {
        assertOpen();
        resourceContributions.push({
          owner: packageName,
          resources: freezeResources(value),
        });
      },
      setRouterProvider(
        value: NonNullable<AppClientRefineConfig['routerProvider']>,
      ): void {
        claim('routerProvider', packageName);
        routerProvider = value;
      },
      setDataProvider(
        value: NonNullable<AppClientRefineConfig['dataProvider']>,
      ): void {
        claim('dataProvider', packageName);
        dataProvider = value;
      },
      setAuthProvider(
        value: NonNullable<AppClientRefineConfig['authProvider']>,
      ): void {
        claim('authProvider', packageName);
        authProvider = value;
      },
      setLiveProvider(
        value: NonNullable<AppClientRefineConfig['liveProvider']>,
      ): void {
        claim('liveProvider', packageName);
        liveProvider = value;
      },
      setNotificationProvider(
        value: NonNullable<AppClientRefineConfig['notificationProvider']>,
      ): void {
        claim('notificationProvider', packageName);
        notificationProvider = value;
      },
      setAccessControlProvider(
        value: NonNullable<AppClientRefineConfig['accessControlProvider']>,
      ): void {
        claim('accessControlProvider', packageName);
        accessControlProvider = value;
      },
      setAuditLogProvider(
        value: NonNullable<AppClientRefineConfig['auditLogProvider']>,
      ): void {
        claim('auditLogProvider', packageName);
        auditLogProvider = value;
      },
      setI18nProvider(
        value: NonNullable<AppClientRefineConfig['i18nProvider']>,
      ): void {
        claim('i18nProvider', packageName);
        i18nProvider = value;
      },
      setOnLiveEvent(value: RefineLiveEventHandler): void {
        claim('onLiveEvent', packageName);
        onLiveEvent = value;
      },
      addLiveEventHandler(handler: RefineLiveEventHandler): void {
        assertOpen();
        liveEventHandlers.push(handler);
      },
      setOptions(value: NonNullable<AppClientRefineConfig['options']>): void {
        claim('options', packageName);
        refineOptions = Object.freeze({ ...value });
      },
    });
  }

  function finalize(): AppClientRefineConfig {
    assertOpen();
    finalized = true;
    const resolvedResources = resolveResources(
      owners.has('resources') ? resources : defaults.resources,
      owners.get('resources') ?? 'App defaults',
      resourceContributions,
    );
    const resolvedOnLiveEvent = resolveLiveEventHandler(
      owners.has('onLiveEvent') ? onLiveEvent : defaults.onLiveEvent,
      liveEventHandlers,
    );
    const resolvedOptions = resolveOptions(defaults.options, refineOptions);

    return Object.freeze({
      ...defaults,
      children: owners.has('children') ? children : defaults.children,
      resources: resolvedResources,
      routerProvider: owners.has('routerProvider')
        ? routerProvider
        : defaults.routerProvider,
      dataProvider: owners.has('dataProvider')
        ? dataProvider
        : defaults.dataProvider,
      authProvider: owners.has('authProvider')
        ? authProvider
        : defaults.authProvider,
      liveProvider: owners.has('liveProvider')
        ? liveProvider
        : defaults.liveProvider,
      notificationProvider: owners.has('notificationProvider')
        ? notificationProvider
        : defaults.notificationProvider,
      accessControlProvider: owners.has('accessControlProvider')
        ? accessControlProvider
        : defaults.accessControlProvider,
      auditLogProvider: owners.has('auditLogProvider')
        ? auditLogProvider
        : defaults.auditLogProvider,
      i18nProvider: owners.has('i18nProvider')
        ? i18nProvider
        : defaults.i18nProvider,
      onLiveEvent: resolvedOnLiveEvent,
      options: resolvedOptions,
    });
  }

  return Object.freeze({ forContribution, finalize });
}

function freezeResources(resources: RefineResources): RefineResources {
  const copy: RefineResources = resources.map((resource) =>
    Object.freeze({ ...resource }),
  );
  Object.freeze(copy);
  return copy;
}

function resolveResources(
  baseResources: RefineResources | undefined,
  baseOwner: string,
  contributions: readonly ResourceContribution[],
): RefineResources | undefined {
  if (!baseResources && contributions.length === 0) {
    return undefined;
  }

  const resolved: RefineResources = [];
  const owners = new Map<string, string>();

  function append(resource: RefineResource, owner: string): void {
    const identifier = getResourceIdentifier(resource, owner);
    const existingOwner = owners.get(identifier);
    if (existingOwner) {
      throw new Error(
        `Refine resource "${identifier}" is already registered by ` +
          `"${existingOwner}"; "${owner}" cannot register it again.`,
      );
    }
    owners.set(identifier, owner);
    resolved.push(resource);
  }

  for (const resource of baseResources ?? []) {
    append(resource, baseOwner);
  }
  for (const contribution of contributions) {
    for (const resource of contribution.resources) {
      append(resource, contribution.owner);
    }
  }

  Object.freeze(resolved);
  return resolved;
}

function getResourceIdentifier(
  resource: RefineResource,
  owner: string,
): string {
  const identifier = resource.identifier?.trim() || resource.name.trim();
  if (!identifier) {
    throw new Error(
      `Client plugin "${owner}" registered a Refine resource without a name or identifier.`,
    );
  }
  return identifier;
}

function resolveLiveEventHandler(
  baseHandler: RefineLiveEventHandler | undefined,
  handlers: readonly RefineLiveEventHandler[],
): RefineLiveEventHandler | undefined {
  if (handlers.length === 0) {
    return baseHandler;
  }

  const registeredHandlers = [...handlers];
  return (event): void => {
    baseHandler?.(event);
    for (const handler of registeredHandlers) {
      handler(event);
    }
  };
}

function resolveOptions(
  defaults: AppClientRefineConfig['options'],
  registered: AppClientRefineConfig['options'],
): AppClientRefineConfig['options'] {
  if (!defaults && !registered) {
    return undefined;
  }
  return Object.freeze({ ...defaults, ...registered });
}
