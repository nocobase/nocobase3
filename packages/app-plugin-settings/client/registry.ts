import type { AppClient } from '@nocobase/app-sdk';
import type { ComponentType } from 'react';

export const APP_SETTINGS_REGISTRY_SERVICE: string =
  '@nocobase/app-plugin-settings:registry';

export type AppSettingsModuleGroup =
  '账号与权限' | '数据与集成' | '自动化与智能' | 'App 设置';

export type AppSettingsModuleStatus =
  '已接入' | '基础接入中' | '模块接入中' | '规划中';

export type AppSettingsModuleIcon =
  | 'bell'
  | 'book-open'
  | 'database'
  | 'folder'
  | 'key'
  | 'settings'
  | 'shield'
  | 'users'
  | 'workflow';

export interface AppSettingsModulePageProps {
  readonly module: AppSettingsRegisteredModule;
  readonly basePath: string;
}

export interface AppSettingsModulePageModule {
  readonly default: ComponentType<AppSettingsModulePageProps>;
}

export type AppSettingsModulePageLoader =
  () => Promise<AppSettingsModulePageModule>;

export interface AppSettingsModuleDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly group: AppSettingsModuleGroup;
  readonly status: AppSettingsModuleStatus;
  readonly owner: string;
  readonly boundary: string;
  readonly icon: AppSettingsModuleIcon;
  readonly priority?: number;
  readonly pageLoader?: AppSettingsModulePageLoader;
}

export interface AppSettingsRegisteredModule extends AppSettingsModuleDefinition {
  readonly packageName: string;
  readonly placeholder: boolean;
  readonly priority: number;
}

export interface AppSettingsModuleRegistry {
  get(moduleId: string): AppSettingsRegisteredModule | undefined;
  list(): readonly AppSettingsRegisteredModule[];
  register(packageName: string, definition: AppSettingsModuleDefinition): void;
  registerPlaceholder(
    packageName: string,
    definition: AppSettingsModuleDefinition,
  ): void;
}

export const APP_SETTINGS_GROUPS: readonly AppSettingsModuleGroup[] =
  Object.freeze(['账号与权限', '数据与集成', '自动化与智能', 'App 设置']);

export const DEFAULT_APP_SETTINGS_MODULES: readonly AppSettingsModuleDefinition[] =
  Object.freeze([
    createDefinition({
      id: 'users',
      title: '用户与组织',
      description: '管理 App 用户、成员状态以及后续组织关系。',
      group: '账号与权限',
      status: '基础接入中',
      owner: '认证与组织模块',
      boundary: '当前只展示模块入口；用户列表和组织管理由对应模块接入。',
      icon: 'users',
      priority: 10,
    }),
    createDefinition({
      id: 'roles',
      title: '角色',
      description: '定义 App 内的职责角色，并维护用户角色分配。',
      group: '账号与权限',
      status: '规划中',
      owner: '权限模块',
      boundary: '角色模型、分配规则和管理页面由权限模块负责。',
      icon: 'key',
      priority: 20,
    }),
    createDefinition({
      id: 'permissions',
      title: '权限',
      description: '配置资源、操作、字段和记录级访问边界。',
      group: '账号与权限',
      status: '规划中',
      owner: '权限模块',
      boundary: '服务端权限执行和配置界面由权限模块统一提供。',
      icon: 'shield',
      priority: 30,
    }),
    createDefinition({
      id: 'data-sources',
      title: '数据源',
      description: '查看当前主数据库，并逐步接入外部数据源。',
      group: '数据与集成',
      status: '基础接入中',
      owner: '数据源模块',
      boundary: '连接配置、凭证、驱动和外部数据源由数据源模块负责。',
      icon: 'database',
      priority: 10,
    }),
    createDefinition({
      id: 'files',
      title: '文件存储',
      description: '管理存储盘、文件分类、访问策略和文件生命周期。',
      group: '数据与集成',
      status: '规划中',
      owner: '文件模块',
      boundary: '存储驱动和文件业务能力属于文件模块，不在 App 内重复实现。',
      icon: 'folder',
      priority: 20,
    }),
    createDefinition({
      id: 'notifications',
      title: '通知',
      description: '管理站内信、邮件及其他通知渠道和模板。',
      group: '数据与集成',
      status: '模块接入中',
      owner: '通知模块',
      boundary: '渠道、Provider、模板和发送记录由通知模块负责。',
      icon: 'bell',
      priority: 30,
    }),
    createDefinition({
      id: 'workflows',
      title: '工作流',
      description: '管理触发器、节点、版本和流程运行记录。',
      group: '自动化与智能',
      status: '规划中',
      owner: '工作流模块',
      boundary: '工作流设计器、执行引擎和审批能力由工作流模块接入。',
      icon: 'workflow',
      priority: 10,
    }),
    createDefinition({
      id: 'knowledge-base',
      title: '知识库',
      description: '管理知识库、文档、向量存储和检索配置。',
      group: '自动化与智能',
      status: '规划中',
      owner: 'AI / 知识库模块',
      boundary: '知识处理、向量化、检索和员工绑定由知识库模块负责。',
      icon: 'book-open',
      priority: 20,
    }),
    createDefinition({
      id: 'general',
      title: 'App 基础设置',
      description: '管理 App 名称、品牌、多语言和基础运行参数。',
      group: 'App 设置',
      status: '规划中',
      owner: 'App Runtime',
      boundary: '预览版先明确配置归属，后续接入真实配置模型和生效机制。',
      icon: 'settings',
      priority: 10,
    }),
  ]);

export function createAppSettingsModuleRegistry(): AppSettingsModuleRegistry {
  const placeholders = new Map<string, AppSettingsRegisteredModule>();
  const contributions = new Map<string, AppSettingsRegisteredModule>();

  return {
    get(moduleId: string): AppSettingsRegisteredModule | undefined {
      const id = normalizeIdentifier(moduleId, 'module id');
      return contributions.get(id) ?? placeholders.get(id);
    },
    list(): readonly AppSettingsRegisteredModule[] {
      const modules = new Map(placeholders);
      for (const [id, contribution] of contributions) {
        modules.set(id, contribution);
      }
      return Object.freeze([...modules.values()].sort(compareModules));
    },
    register(
      packageName: string,
      definition: AppSettingsModuleDefinition,
    ): void {
      registerDefinition(contributions, packageName, definition, false);
    },
    registerPlaceholder(
      packageName: string,
      definition: AppSettingsModuleDefinition,
    ): void {
      registerDefinition(placeholders, packageName, definition, true);
    },
  };
}

export function createDefaultAppSettingsModuleRegistry(): AppSettingsModuleRegistry {
  const registry = createAppSettingsModuleRegistry();
  for (const definition of DEFAULT_APP_SETTINGS_MODULES) {
    registry.registerPlaceholder('@nocobase/app-plugin-settings', definition);
  }
  return registry;
}

export function getOrCreateAppSettingsModuleRegistry(
  client: AppClient,
): AppSettingsModuleRegistry {
  const existing = client.services.get<AppSettingsModuleRegistry>(
    APP_SETTINGS_REGISTRY_SERVICE,
  );
  if (existing) {
    return existing;
  }

  const registry = createAppSettingsModuleRegistry();
  client.services.register(APP_SETTINGS_REGISTRY_SERVICE, registry);
  return registry;
}

export function registerDefaultAppSettingsModules(client: AppClient): void {
  const registry = getOrCreateAppSettingsModuleRegistry(client);
  for (const definition of DEFAULT_APP_SETTINGS_MODULES) {
    registry.registerPlaceholder('@nocobase/app-plugin-settings', definition);
  }
}

export function registerAppSettingsModule(
  client: AppClient,
  packageName: string,
  definition: AppSettingsModuleDefinition,
): void {
  getOrCreateAppSettingsModuleRegistry(client).register(
    packageName,
    definition,
  );
}

function createDefinition(
  definition: AppSettingsModuleDefinition,
): AppSettingsModuleDefinition {
  return Object.freeze({ ...definition });
}

function registerDefinition(
  target: Map<string, AppSettingsRegisteredModule>,
  packageName: string,
  definition: AppSettingsModuleDefinition,
  placeholder: boolean,
): void {
  const normalizedPackageName = normalizeIdentifier(
    packageName,
    'package name',
  );
  const normalized = normalizeDefinition(
    normalizedPackageName,
    definition,
    placeholder,
  );
  const existing = target.get(normalized.id);
  if (existing && existing.packageName !== normalizedPackageName) {
    throw new Error(
      `App settings module "${normalized.id}" is already registered by "${existing.packageName}".`,
    );
  }
  target.set(normalized.id, normalized);
}

function normalizeDefinition(
  packageName: string,
  definition: AppSettingsModuleDefinition,
  placeholder: boolean,
): AppSettingsRegisteredModule {
  return Object.freeze({
    ...definition,
    id: normalizeIdentifier(definition.id, 'module id'),
    title: normalizeIdentifier(definition.title, 'module title'),
    description: normalizeIdentifier(
      definition.description,
      'module description',
    ),
    owner: normalizeIdentifier(definition.owner, 'module owner'),
    boundary: normalizeIdentifier(definition.boundary, 'module boundary'),
    packageName,
    placeholder,
    priority: definition.priority ?? 100,
  });
}

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`App settings ${label} must not be empty.`);
  }
  return normalized;
}

function compareModules(
  left: AppSettingsRegisteredModule,
  right: AppSettingsRegisteredModule,
): number {
  const leftGroup = APP_SETTINGS_GROUPS.indexOf(left.group);
  const rightGroup = APP_SETTINGS_GROUPS.indexOf(right.group);
  return (
    leftGroup - rightGroup ||
    left.priority - right.priority ||
    left.title.localeCompare(right.title)
  );
}
