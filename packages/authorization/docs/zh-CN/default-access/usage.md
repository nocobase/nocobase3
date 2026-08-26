# Default Access

Default Access 为资源和动作设置默认对象范围。它只扩大已经获得对应 Action Grant 的
主体的访问范围，不会单独授予动作权限。

## 安装

```ts
import { defaultAccess } from '@nocobase/authorization/default-access';

const authz = createAuthorization({
  connection,
  plugins: [grantProvider, defaultAccess(), resourceAuthorization],
});
```

使用默认数据库 Store 时，需要提供 `connection`，并执行 migration：

```text
@nocobase/authorization/default-access/migrations/202608210002_create_default_access_rules
```

显式选择的记录按 Action 保存在 `authorizationDefaultAccessRuleRecords`，规则表不保存
大段 ID 数组。

## 设置默认范围

允许所有已获得文章读取权限的主体读取全部文章：

```ts
await authz.defaultAccess.set({
  resource: {
    type: 'database.collection',
    id: 'main.articles',
  },
  actions: [{ action: 'read', scope: { type: 'all' } }],
});
```

也可以设置指定对象范围：

```ts
await authz.defaultAccess.set({
  resource: {
    type: 'document.library',
    id: 'help-center',
  },
  actions: [
    {
      action: 'read',
      scope: { type: 'ids', ids: ['getting-started', 'faq'] },
    },
  ],
});
```

资源插件可以提供自己的 Scope 构造方法。Database Authorization 可以使用 Record
Access Policy：

```ts
await authz.defaultAccess.set({
  resource: {
    type: 'database.collection',
    id: 'main.articles',
  },
  actions: [
    {
      action: 'read',
      scope: authz.database.scope('publishedArticles'),
    },
  ],
});
```

## 管理配置

```ts
const rule = await authz.defaultAccess.get(
  'database.collection',
  'main.articles',
);

const rules = await authz.defaultAccess.list();

await authz.defaultAccess.delete('database.collection', 'main.articles');
```

再次调用 `set()` 会更新相同 Resource Type 和 Resource ID 的配置。

## 授权结果

Default Access 返回 `effect: "expand"` 的访问约束。资源 Handler 决定如何解释和执行
具体 Scope。

以 Database Authorization 为例，默认范围会与 Grant Record Access、Sharing Rules
一起组成正向记录范围，之后再应用 Restriction Rules。

## 自定义 Store

测试或使用其他持久化方案时，可以实现 `DefaultAccessStore`：

```ts
const plugin = defaultAccess({
  store: customDefaultAccessStore,
});
```

提供自定义 Store 时不需要 `connection`，但应用需要自行负责数据结构和生命周期。
