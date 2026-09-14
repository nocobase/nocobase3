# Authorization

`@nocobase/authorization` 为应用和业务插件提供统一的权限判断能力。你可以用它：

- 定义用户、角色、服务账号和 AI Agent 的访问权限；
- 保护数据库记录、字段、文件和知识库等资源；
- 将一组权限保存为 Permission Set 并重复分配；
- 为应用自己的资源编写强类型授权规则；
- 在 HTTP 请求、后台任务和测试中使用同一套授权 API。

Authorization 由 Core 和插件组成。Grant Provider 提供基础授权，资源插件负责解释
具体资源的规则，业务模块负责执行授权结果。

规则插件产出的是不透明的范围引用（`{ type: 'all' }`、`{ type: 'ids', ids }` 等）。
解释这些引用的资源插件属于应用层：数据库资源插件由 `@nocobase/app-plugin-authorization`
提供，它把授权结果翻译成 `@nocobase/db` 的 Repository Policy。

## 文档地图

- [Authorization Core](./core/usage.md)：创建实例、定义身份、注册资源规则、执行权限
  判断，以及开发授权插件。
- [Permission Sets](./permission-sets/usage.md)：创建和分配权限集合、查询有效权限、
  挂载 HTTP API，以及自定义存储。
- [Default Access](./default-access/usage.md)：为资源和动作设置默认对象范围。
- [Sharing Rules](./sharing-rules/usage.md)：把指定对象或满足条件的对象分享给主体。
- [Restriction Rules](./restriction-rules/usage.md)：为指定主体增加必须满足的对象范围限制。

## 包入口

```ts
import { createAuthorization } from '@nocobase/authorization/core';
import { permissionSets } from '@nocobase/authorization/permissions';
import { defaultAccess } from '@nocobase/authorization/default-access';
import { sharingRules } from '@nocobase/authorization/sharing-rules';
import { restrictionRules } from '@nocobase/authorization/restriction-rules';
```

通常先从 [Authorization Core](./core/usage.md) 的快速开始和资源权限示例读起；需要
集中管理权限时，再安装并使用 Permission Sets。
