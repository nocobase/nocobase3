---
title: Repository 事务与乐观锁
description: 在事务 Connection 内绑定 Repository，协调多次查询和写入，使用 ifVersion 防止覆盖并发修改，并理解异常传播、嵌套写入回滚及批量操作保护。
---

# Repository 事务与乐观锁

事务解决多步操作是否一起提交，`ifVersion` 解决修改是否仍基于调用方读取的版本；两者不能互相替代。示例假设 `db` 为已配置的 DatabaseManager，模型和主键约定见[概览](./overview.md)。

## 多次调用使用一个事务 Connection

```ts
const created = await db.transaction(async (connection) => {
  const projects = connection.repository('projects');
  const tasks = connection.repository('tasks');

  const project = await projects.createOne({
    values: {
      id: 'project-transaction',
      name: 'Transactional project',
      status: 'draft',
    },
    select: (select) => select.fields('id', 'name'),
  });

  await tasks.createOne({
    values: {
      id: 'task-transaction',
      title: 'First task',
      status: 'open',
      projectId: project.record.id,
    },
  });

  return project.record;
});

console.log(created);
```

回调成功后提交，抛出异常则回滚；transaction 返回回调的返回值。指定连接可以使用 `db.connection('main').transaction(...)`，也可以使用 `db.transaction(callback, 'main')`。

重要规则：

- 在回调内从参数 `connection` 获取所有需要参与事务的 Repository。
- 外层 `db.repository()` 或其他连接获取的 Repository 不会自动加入该事务。
- 不把事务 Repository 保存到回调之外继续使用。
- 等待所有数据库操作结束再返回，不启动未 await 的后台写入。
- 事务范围是单个连接；它不是跨多个数据库连接的分布式事务。

Repository 方法没有 `transaction` 参数；`context` 用于查询变量，也不是事务载体。

## 内部事务与异常传播

根级 `createOne / updateOne / upsertOne / deleteOne` 的执行，以及批量 select returning 所需的多步执行，会在没有外部事务时使用内部事务。嵌套关系 mutation 共享根操作的事务。

如果当前 Connection 已在事务中，Repository 复用它，不为每次普通 mutation 自动创建独立保存点。因此不要在回调里捕获写入失败后当作成功继续提交：

```ts
try {
  await db.transaction(async (connection) => {
    const projects = connection.repository('projects');

    await projects.updateOne({
      filter: { id: 'project-1' },
      values: { status: 'active' },
    });

    throw new Error('Cancel the complete operation');
  });
} catch (error) {
  console.error(error);
}
```

在事务外捕获异常，才保留“任一步失败则整个回调回滚”的保证。若业务确实需要恢复某个步骤，应显式设计保存点策略并在目标数据库验证，不依赖 Repository 隐含回滚单个调用。

数据库回滚不会撤销邮件、消息、文件上传等外部副作用；需要在提交后触发，或采用应用层可靠事件机制。

## 使用 ifVersion 防止覆盖旧数据

Collection 必须预先配置 optimisticLock，并指定版本字段。本例中该字段为 `version`；不是所有包含名为 version 字段的 Collection 都自动启用乐观锁。

```ts
import { RepositoryError } from '@nocobase/db';

const projects = db.repository('projects');
const current = await projects.findOne({
  filter: { id: 'project-1' },
  select: (select) => select.fields('id', 'name', 'version'),
});

if (!current) throw new Error('Project does not exist');
if (
  typeof current.version !== 'number' &&
  typeof current.version !== 'string'
) {
  throw new Error('Expected an optimistic lock version');
}

try {
  const result = await projects.updateOne({
    filter: { id: 'project-1' },
    values: { name: 'Updated project' },
    ifVersion: current.version,
    select: (select) => select.fields('id', 'name', 'version'),
  });
  console.log(result.record);
  console.log(result.version);
} catch (error) {
  if (error instanceof RepositoryError && error.code === 'VERSION_CONFLICT') {
    console.log('Reload the project and resolve the conflicting changes');
  } else {
    throw error;
  }
}
```

- create 初始化版本为 `1`；更新由 Repository 自动递增版本，包括关系写入导致的根更新。
- 传入读取到的原始版本值，不把所有数据库返回值强制转换成 number。
- `ifVersion` 可用于 `updateOne / deleteOne / upsertOne`。upsert 仅更新分支比较版本，没有目标时仍可创建。
- 未配置 optimisticLock 却传 ifVersion，会报 `INVALID_MUTATION`。
- 未传 ifVersion 的更新仍会递增已配置的版本，但不会检查调用方是否基于旧版本。
- 根级 ifVersion 不等于所有嵌套目标和 through 行的独立版本校验。
- 批量方法没有逐条 ifVersion；不能将 updateMany 视为对每条记录分别做乐观锁比较。

冲突时重新读取并让业务决定重试、合并或拒绝，不要简单去掉 ifVersion 再执行。事务或行锁也不自动替你检测事务开始前已经陈旧的用户输入。

## 单条与批量范围保护

| 场景                           | 契约                                     |
| ------------------------------ | ---------------------------------------- |
| `updateOne / deleteOne` 无匹配 | `RECORD_NOT_FOUND`                       |
| 单条 mutation 命中多条         | `MULTIPLE_RECORDS_MATCHED`               |
| ifVersion 不匹配               | `VERSION_CONFLICT`                       |
| `upsertOne` 定位               | 必须是完整唯一键等值条件                 |
| 批量更新／删除                 | 非空 filter 或显式 `all: true`，二者互斥 |
| View Collection 写入           | `READ_ONLY_COLLECTION`                   |

filter 只能约束实际传入的条件，不会自动添加用户权限或租户条件。`validateMutation` 只做输入与元数据校验，不能替代实际版本检查或授权。详细输入见[记录写入](./mutations.md)。

## 验证事务代码

1. 成功路径：多次写入全部提交，返回值在事务结束后仍是普通数据。
2. 失败路径：在第二步或嵌套关系操作中制造错误，确认第一步也没有提交。
3. 连接绑定：所有参与操作都来自同一个事务 Connection。
4. 乐观锁：使用旧版本更新和删除应冲突，数据和版本不应发生部分修改。
5. 数据库差异：在实际部署数据库验证锁、唯一冲突和事务行为，不以 SQLite 测试替代其他数据库验证。

事务不负责 DDL 迁移策略；Schema 变更应按 Migration 规范处理，而不是放进这些记录访问示例。
