---
title: '向量数据库'
description: '使用 PGVector 存储 AI 知识库的向量索引，支持管理后台和 config.yml 两种配置方式。'
keywords: '向量数据库,PGVector,NocobaseDefaultPGVectorProvider,Embedding,PostgreSQL'
---

# 向量数据库

在 AI 知识库中，向量数据库保存文档分段和相关问题的向量索引。用户提问时，系统把问题转换为向量，再按相似度召回知识库内容。

当前 AI 知识库插件内置支持 PGVector provider。PGVector 基于 PostgreSQL，需要数据库安装 `vector` 扩展。

## 前置条件

- 可访问的 PostgreSQL 实例
- 有权限连接数据库并创建或使用向量表的账号
- 已安装 PostgreSQL `vector` 扩展
- 已配置可用的 Embedding service 和 embedding model
- NocoBase 应用的队列服务正常运行

## 通过 `config.yml` 配置

推荐在应用配置中声明向量数据库，适合部署和多环境管理：

```yaml
ai:
  aiKnowledgeBase:
    vectorDatabases:
      - name: pgvector-main
        provider: NocobaseDefaultPGVectorProvider
        databaseSpec: PGVector
        enabled: true
        connection:
          host: ${PGVECTOR_HOST}
          port: 5432
          user: ${PGVECTOR_USER}
          password: ${PGVECTOR_PASSWORD}
          database: ${PGVECTOR_DATABASE}
          tableName: nocobase_ai_vectors
```

`name` 必须唯一，并且会同时作为稳定 key。`provider` 和 `databaseSpec` 默认值分别是 `NocobaseDefaultPGVectorProvider` 和 `PGVector`，不过建议在配置中明确写出。

环境变量引用会递归展开。不要把真实密码提交到 Git。

配置文件管理的记录会标记为 `managedBy: config`。它们不能通过管理页面或公开更新接口修改、删除；需要修改连接信息时，编辑 `config.yml` 并重新加载配置。

## 在管理页面创建

打开 AI 设置中的「Vector Database」页签，点击「Add new」，填写：

- `Name`：连接名称
- `Host`：PostgreSQL 地址
- `Port`：端口，通常是 `5432`
- `Username`：数据库账号
- `Password`：数据库密码
- `Database`：数据库名称
- `Table name`：存储向量数据的表名

点击「Test」检查 `SELECT 1` 连接测试，再点击「Submit」保存。手动创建的记录可以在管理页面维护。

## 知识库如何使用配置

LOCAL 和 READONLY 知识库会保存三项向量存储配置：

- `vectorDatabaseKey`
- `llmService`
- `embeddingModel`

三项配置共同决定向量存储的配置 hash。修改向量数据库、service 或 model 不会自动重建全部向量。确认变更后，应选择受影响的文档重新向量化，并运行命中测试。

## 变更和删除

删除或替换向量数据库前，按下面的顺序检查：

1. 找出所有引用该数据库的知识库
2. 备份向量数据和连接配置
3. 停用或迁移依赖的知识库
4. 在替代数据库上完成连接和检索测试
5. 确认没有队列任务仍指向旧数据库
6. 获得明确批准后再删除

如果配置管理的向量数据库仍被知识库引用，插件会保留它并发出警告。不要通过直接删除数据库记录绕过这个保护。

## 检索为空时检查

如果连接测试通过但命中测试为空，依次检查：

- 文档状态是否为 `SUCCESS`
- 知识库是否启用
- Embedding service 和模型是否可用
- 向量表是否包含当前知识库的向量
- `Score` 是否设置得过高
- 查询是否使用了正确的知识库 key

## 相关链接

- [快速开始](../quick-start/index.md) — 从 `config.yml` 配置 PGVector
- [配置和管理知识库](./knowledge-bases.md) — 在管理页面使用向量数据库
- [AI 员工 RAG 检索](../quick-start/agent-rag.md) — 配置检索策略和阈值
