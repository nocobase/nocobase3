# 插件开发快速开始

本页已由 capability-driven 快速开始替代：

- [创建并接入插件](./development/plugin-development/quick-start.md)
- [插件开发](./development/plugin-development.md)

不要再按旧的完整模板目录或“生成后裁剪”流程开发插件。Agent 应先把需求映射为
capability，运行 `plugin:create --dry-run --json` 检查计划，再执行真实创建。

## 多语言

选择任一 Client plugin capability 时，脚手架会生成 `client/locales/`，并在
`client/plugin.ts` 中声明 locale loader：

```ts
export default defineClientPlugin({
  packageName: '@nocobase/app-plugin-audit-log',
  locales: () => import('./locales/index.js'),
});
```

`en-US.ts` 定义源语言资源，并通过 `LocaleResource` 导出其他语言共享的结构类型：

```ts
import type { LocaleResource } from '@nocobase/app-i18n';

const enUS = {
  list: { title: 'Audit log' },
};

export type AuditLogResource = LocaleResource<typeof enUS>;

export default enUS;
```

```ts
import type { AuditLogResource } from './en-US.js';

const zhCN: AuditLogResource = {
  list: { title: '审计日志' },
};

export default zhCN;
```

页面中通常不需要显式填写 namespace；App 渲染插件页面时会把插件包名注入为默认
namespace。供 App 复用的公共组件和 bootstrap 中注册的静态文案应显式提供插件
namespace。

服务端 locale loader 使用相同的资源结构。HTTP 请求中通过 `c.get('t')` 翻译；queue
job、cron 等请求外场景应先调用 `await i18n.ensureLocaleLoaded(locale)`。

完整说明见 [国际化设计](./i18n.md)和
[app-i18n README](../packages/app-i18n/README.md)。
