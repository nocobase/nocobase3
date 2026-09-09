---
title: Application Hub 用户与权限技术方案
description: Application Hub 首期用户体系、角色权限与鉴权实现
status: proposal
date: 2026-09-08
---

# Application Hub 用户与权限技术方案

## 1. 目标与范围

Hub 当前只有“系统管理员”和“非系统管理员”两种状态。所有 `/api/hub/*` 接口都依赖 `system-administrator`，无法把查看、运维和用户管理分开授权。

本方案解决三个问题：

1. 用户由哪个模块管理，账号禁用后如何立即失效；
2. Hub 有哪些角色，角色如何分配给用户；
3. 前后端如何执行权限，确保不能通过直接调用 API 越权。

适用基线为 `develop@d29d1fe9`。首期不包含邀请、强制首次改密、自定义角色和 App 级授权。

本方案只处理通过浏览器登录的人员账号。CLI/CI 使用的部署 Token 属于机器身份，不复用用户密码和浏览器 Session；其签发、保存、撤销和权限范围另行设计，最终仍接入同一套 `resource/action` 服务端鉴权。

## 2. 总体架构

权限链路从用户开始：

```text
用户 → Hub 角色 → Permission Set grants → resource/action → Hub API
```

各模块只承担一层职责：

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Authentication | 用户基础数据、密码、登录、Session、账号状态 | 角色和业务权限 |
| Users | 通用用户管理 API 与页面、用户生命周期编排、角色范围扩展点 | 具体应用的角色定义 |
| Authorization | Permission Set、角色分配和 resource/action 判定 | 用户凭据和 Hub 业务规则 |
| Hub | Hub 角色、App/Host 权限和 Hub 特有约束 | 通用用户管理和认证协议 |
| Host | 执行已授权的部署与运行命令 | 解析用户和角色 |

不启用 Better Auth Admin 插件。它会引入另一套 role/permission 模型；用户身份继续使用 Better Auth，授权统一使用 NocoBase Authorization。

### 2.1 Hub 权限隔离

Hub 的角色、资源和业务规则全部由 `@nocobase/app-plugin-hub` 提供：

- Hub migration 写入 `hub-administrator`、`hub-operator`、`hub-viewer` 及其 grants，seed 只负责给初始管理员分配角色；
- `hub.app`、`hub.host` 的 resource handler 在 Hub Server Provider 中注册；
- Hub 的角色范围、单角色约束和最后管理员保护也在 Hub 中实现。

Users 和 Authorization 只提供通用机制，不能包含 `hub-*` key、Hub action 或 Hub 业务判断，也不能依赖 Hub 插件。

```text
app-plugin-hub
  ├─ resolve(authorizationToken) 注册 Hub 资源并执行鉴权
  └─ resolve(userRoleScopeRegistryToken) 注册 Hub 角色范围

app-plugin-users ──→ authentication + authorization
app-plugin-authorization ──→ authorization library
```

默认 App 安装 Users、Authentication 和 Authorization 时，不会产生 Hub Permission Set、Hub resource handler 或 Hub 菜单。只有安装并启用 Hub 插件的应用才加载这些内容。

## 3. 用户管理

### 3.1 通用 Users 插件

用户管理拆为 `@nocobase/app-plugin-users`，并在 Hub 与默认 App 模板中启用。它提供：

- `/api/users` 用户管理 API；
- 可复用的 Users 页面和路由贡献；
- `UserManagementService`；
- 供应用注册角色规则的 `UserRoleScope` 扩展点。

Users 不固定页面路径和导航位置。Hub 把它挂载到主控制台的“用户与权限”分组：`/users` 是“用户管理”，`/roles` 是 Hub 提供的只读角色权限矩阵，最终地址分别为 `/hub/users` 和 `/hub/roles`；默认 App 仍挂载到 `/settings/users`。应用通过注册参数选择挂载位置、相对路径和导航分组；组件覆盖只替换页面实现，不改变路径。

Users 不预设任何应用角色，也不自行授予访问权。安装它的应用必须通过 Permission Set 配置 `page:users/access` 和相应的 `user` actions。默认 App 可以注册自己的角色范围，也可以只使用用户资料、禁用、密码重置和 Session 管理。

### 3.2 数据归属

Users 不建立第二份用户数据。首期复用现有表：

| 表 | 归属 | 变化 |
| --- | --- | --- |
| `user` | Authentication | 新增可空字段 `disabledAt` |
| `account`、`session` | Authentication | 结构不变 |
| `authorizationPermissionSets` | Authorization | 由 Hub 写入三个 `hub-*` 角色 |
| `authorizationPermissionSetAssignments` | Authorization | 保存用户与 Hub 角色的分配关系 |

不在 `user` 表增加 `role` 字段，也不建立 Hub 私有角色表。角色定义和分配关系只有 Authorization 一份数据源。

### 3.3 Authentication 用户服务

Authentication 新增稳定的 `userAdministrationServiceToken`，向 Users 提供用户查询、创建、更新、启停、重置密码和撤销 Session 的能力，并支持绑定数据库事务。Users 不直接操作 Authentication 的内部表。

密码长度校验和哈希使用 Authentication 中现有的 Better Auth 配置。服务不返回密码哈希、Session token 或重置 token。

`disabledAt` 通过 Better Auth 的 user additional field 注册。禁用账号时执行三项操作：

1. 设置 `disabledAt`；
2. 撤销数据库及缓存中的全部 Session；
3. 关闭该用户当前的 Realtime 连接。

`Auth.getSession()` 返回 Session 前按 user ID 查询当前账号状态，禁用用户按未登录处理。`required()`、`optional()` 和 Realtime principal resolver 因此使用同一条规则。

### 3.4 用户 API

| API | 权限 | 作用 |
| --- | --- | --- |
| `GET /api/users/options` | `user:*:read` | 返回可用角色范围及其选项 |
| `GET /api/users` | `user:*:read` | 分页、搜索，按状态或角色过滤 |
| `POST /api/users` | `create`、`assign-role` | 创建用户，并按应用要求分配角色 |
| `PATCH /api/users/:userId` | `update` | 修改姓名、用户名和邮箱 |
| `POST .../:userId/disable`、`enable` | 对应同名 action | 改变账号状态 |
| `PUT .../:userId/role-scopes/:scope` | `assign-role` | 更新指定角色范围 |
| `POST .../:userId/reset-password` | `reset-password` | 设置新密码并撤销 Session |
| `POST .../:userId/revoke-sessions` | `revoke-sessions` | 强制所有设备重新登录 |

按角色筛选时，`UserManagementService` 通过对应 `UserRoleScope` 查询 user IDs，再让 Authentication 按这些 IDs 查询用户。Users 不直接联表读取其他插件的私有表。

首期不提供删除用户 API。离职或停用账号使用 disable，保留用户 ID，避免 Deployment 历史和安全日志失去操作者引用。

## 4. Hub 角色与权限

### 4.1 角色定义

Hub 首期提供三个固定角色：

| 能力 | Administrator | Operator | Viewer |
| --- | :---: | :---: | :---: |
| 查看 App、Release、Deployment 和 Host 状态 | ✓ | ✓ | ✓ |
| 查看现有 Resources | ✓ | ✓ | — |
| 创建 App、上传 Release | ✓ | ✓ | — |
| Deploy、Rollback、Start、Stop、Restart | ✓ | ✓ | — |
| 修改 App 设置、原始配置和配置模板 | ✓ | ✓ | — |
| 删除 App | ✓ | — | — |
| 管理用户和角色 | ✓ | — | — |

对应的 Permission Set key 为：

- `hub-administrator`
- `hub-operator`
- `hub-viewer`

`system-administrator` 表示框架级 Authorization 管理员，`hub-administrator` 表示 Hub 业务管理员。Hub Route 不判断角色名称，只校验 resource/action。升级时为现有系统管理员补充 `hub-administrator`，不在运行时做隐式继承。

Operator 是可信运维角色，可以读取和修改原始配置。如果需要不接触密钥的发布角色，应增加独立角色或结构化配置权限，不能依赖对 YAML 文本做字符串脱敏。

### 4.2 Hub 角色范围

Users 通过 `userRoleScopeRegistryToken` 暴露角色范围扩展点，应用可以提供可选角色、读取和替换分配关系，并在禁用用户前执行约束检查。Hub 注册自己的 `UserRoleScope`：

Hub scope 的配置为：

| 属性 | 值 |
| --- | --- |
| `key` | `hub` |
| `selection` | `single` |
| `requiredOnCreate` | `true` |
| 可选角色 | 三个 `hub-*` Permission Set |
| 禁用前校验 | 至少保留一个启用的 Administrator |

Users API 将 scope 元数据返回给 Client，通用 Users 页面据此渲染单选角色字段。创建 Hub 用户时提交 `roleScopes: { hub: <role> }`。

三个 `hub-*` Permission Set 由 Hub 注册为受保护集合。通用 Permission Set API 不能修改、删除或直接分配它们；角色变更只能通过 Hub role scope 执行。

### 4.3 角色变更事务

创建用户并分配角色、替换角色、禁用管理员和最后管理员检查必须在同一个数据库事务中完成：

```text
UserManagementService 开启事务
  ├─ Authentication 创建或更新用户
  └─ Hub role scope
       ├─ 锁定 hub-administrator Permission Set 记录
       ├─ 检查启用的 Administrator 数量
       └─ Authorization 原子替换目标用户的 Hub 角色
```

Authentication 和 Authorization 的管理服务都支持绑定同一个 transaction。Authorization 按 Hub 管理的 Permission Set key 原子替换 assignments，不影响用户在其他范围内的 Permission Set；数据库唯一约束避免重复分配。

禁用或降级最后一个启用的 Administrator 时返回 `409 LAST_HUB_ADMIN`。对 `hub-administrator` 记录执行 `SELECT ... FOR UPDATE`，保证并发操作下仍至少保留一个启用的 Administrator。

## 5. 权限执行

### 5.1 资源与动作

| 资源 | ID | 动作 |
| --- | --- | --- |
| `user` | `userId` 或 `*` | `read`、`create`、`update`、`disable`、`enable`、`assign-role`、`reset-password`、`revoke-sessions` |
| `hub.app` | `appId` 或 `*` | `read`、`create`、`update-settings`、`remove`、`read-release`、`upload-release`、`read-config-template`、`read-deployment`、`deploy`、`rollback`、`read-config`、`update-config`、`refresh`、`start`、`stop`、`restart` |
| `hub.host` | `global` | `read` |

Release、Deployment、Config 和运行操作都从属于 App，因此统一以 `appId` 作为 `hub.app` 的资源 ID。列表接口首期要求 `*` 权限，例如 `GET /api/hub/apps` 校验 `hub.app:*:read`。

三个 Permission Set 的 grants 固定如下：

| Permission Set | Grants |
| --- | --- |
| `hub-administrator` | `page:hub/access`、`page:users/access`；`hub.app:*`、`user:*` 的全部动作；`hub.host:global:read` |
| `hub-operator` | `page:hub/access`；除 `remove` 外的全部 `hub.app:*` 动作；`hub.host:global:read` |
| `hub-viewer` | `page:hub/access`；`hub.app:*` 的 `read`、`read-release`、`read-deployment`；`hub.host:global:read` |

### 5.2 服务端鉴权

每个请求依次执行：

```text
认证用户 → 建立授权上下文 → 校验 resource/action → 执行业务
```

Hub 注册 `hub.app` 和 `hub.host` resource handler，Users 注册 `user` handler。Handler 先拒绝未定义的 action，再通过 `context.grants.resolve()` 查找匹配 grant。

Route 必须在读取或修改数据前执行：

```ts
await context.get('authz').require({
  resource: { type: 'hub.app', id: appId },
  action: 'deploy',
});
```

无权限统一返回 403。现有 Hub Route 删除 `system-administrator` 判断，不能依赖前端是否显示按钮。

### 5.3 Client 权限

Authorization Client 通过 `authorizationClientToken` 提供权限判断和权限快照失效能力。Client 使用同一份权限快照控制路由、Tab 和按钮：

- `page:hub/access` 控制主控制台的 `/apps`；
- `page:users/access` 控制“用户与权限”分组、`/users` 用户管理和 `/roles` 角色权限矩阵，权限结果返回前不展示入口；
- App 操作按钮按 `hub.app` action 显示。

角色权限矩阵通过 `GET /api/hub/roles` 读取三个 Hub Permission Set 的实际 grants，只读展示，不开放通用 Permission Set 编辑器。

前端控制只改善体验。登录身份变化、当前用户角色变化或第一次收到 403 时清除权限快照并重新加载；刷新后仍无权则展示权限错误，不循环重试。

## 6. 配置与 Resources 访问边界

原始配置可能包含数据库密码、密钥和内部地址。Viewer 不能收到原始配置或 Release config template。

首期不改造 Hub 现有 Resources 页面，也不新增资源摘要接口。该页面当前依赖原始配置，因此仅 Administrator 和 Operator 可见，并复用 `read-config` 权限；Viewer 隐藏入口，直接调用配置接口返回 403。

如果后续需要让 Viewer 查看非敏感资源状态，应由 App 提供运行时资源摘要，再为其设计独立权限，不能由浏览器解析原始配置实现。

## 7. 初始化与升级

Hub migration 明确写入三个 Permission Set 及其 grants，不从运行时代码动态生成历史 migration。

已有 Hub 升级顺序：

1. 创建三个 Hub Permission Set；
2. 为每个已分配 `system-administrator` 的 user subject 补充 `hub-administrator`；
3. 确认至少存在一个启用的 Hub Administrator；
4. 将 Hub Route 切换到 resource/action 校验。

新安装由 Hub seed 给初始管理员分配 `hub-administrator`。Migration 和 seed 都必须幂等。

首期不实现邀请。Hub 模板默认关闭公开注册，由 Administrator 创建账号并分配 Hub 角色：

```yaml
auth:
  emailAndPassword:
    enabled: true
    disableSignUp: true
```

该配置不改变默认 App 模板。后续如支持 Hub 自主注册，需要另行定义默认角色、审核流程和防越权规则。

## 8. 验收标准

- 三个角色的服务端权限与第 4.1 节矩阵一致；
- 直接调用无权限 API 返回 403；
- Viewer 看不到 Resources 入口，且不能读取原始配置和配置模板；
- 禁用用户后，Session 和 Realtime 连接均失效；
- 用户始终只有一个标准 Hub 角色；
- 最后一个启用的 Administrator 不能被禁用或降级；
- 升级数据库和新安装都能得到可登录的 Hub Administrator；
- 不安装 Hub 插件的默认 App 中不存在 `hub-*` Permission Set、资源或页面；
- 密码、Session token 和配置正文不进入日志。

用户创建、角色变更、账号启停、密码重置、Session 撤销和 Hub 写操作写入结构化安全日志。日志不得记录密码、Session token、Authorization header、配置正文和制品内容。首期不新增审计查询页面。

## 9. 改造清单

| 顺序 | 包 | 改造内容 |
| --- | --- | --- |
| 1 | `app-plugin-authentication` | 增加 `disabledAt`、`userAdministrationServiceToken` 和禁用用户检查 |
| 2 | `app-server` Realtime | 支持按 user ID 关闭现有连接 |
| 3 | `authorization` / `app-plugin-authorization` | 支持受保护 Permission Set、事务化替换 assignments、权限快照失效 |
| 4 | `app-plugin-users` | 实现用户服务、API、可复用页面、`user` resource 和 `UserRoleScope` 扩展点 |
| 5 | `app-plugin-hub` | 注册 Hub 资源、三个角色和 Hub role scope；提供只读角色矩阵并实现最后管理员保护 |
| 6 | `app-template-default` / `app-template-hub` | 注册 Users 插件；默认 App 放在 Settings，Hub 放在主控制台且关闭公开注册 |
| 7 | 上述各包 | 完成 migration、seed、单元测试、集成测试和三角色 E2E |
