---
title: '开始使用 AI 知识库'
keywords: 'AI 知识库,快速开始,PGVector,上传文档,命中测试,RAG'
---

# 建立第一套知识库

跟着这篇文档完成四步，你就可以在 NocoBase 中创建一个知识库，上传文档并验证检索结果。

## 前置条件

- 已通过 `plugin:register` 将专业版 `@nocobase/app-plugin-ai-knowledge-base` 添加到应用并启用
- 已配置一个可用的 Embedding 模型
- 已准备 PostgreSQL 数据库，并安装 `vector` 扩展
- 你拥有应用管理权限

## 第一步：配置向量数据库

在应用根目录的 `config.yml` 中添加 `ai.aiKnowledgeBase.vectorDatabases`。下面的配置使用插件内置的 PGVector provider：

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

设置环境变量后启动或重载应用配置：

```bash
export PGVECTOR_HOST='localhost'
export PGVECTOR_PASSWORD='请替换为数据库密码'
export PGVECTOR_DATABASE='nocobase'
pnpm dev
```

其中：

- `name` 是向量数据库名称，同时也是稳定的 key。创建知识库时通过这个 key 引用它
- `provider` 必须使用区分大小写的 `NocobaseDefaultPGVectorProvider`
- `databaseSpec` 使用 `PGVector`
- `tableName` 只能包含一个可选的 schema 前缀，并符合数据库表名规则

:::warning 注意

配置文件中的密码建议使用环境变量。向量数据库配置由 `config.yml` 管理后，管理页面不能直接编辑或删除对应记录；请回到配置文件修改。

:::

进入 AI 设置中的「Vector Database」页签，确认 `pgvector-main` 已出现。也可以点击手动创建的连接的「Test」按钮检查连接；配置文件管理的连接会显示为只读。

## 第二步：创建知识库

在 AI 设置页面进入「Knowledge Base」页签，点击「Add new」或「Create」。创建一个本地知识库：

1. 填写知识库名称和唯一 key
2. 将类型设置为 `LOCAL`
3. 选择文件存储 disk
4. 选择 `pgvector-main`
5. 选择用于 Embedding 的 LLM service 和 embedding model
6. 保持分段开关开启，先使用默认的 `chunkSize: 6000` 和 `chunkOverlap: 1200`
7. 保存知识库

LOCAL 知识库负责保存源文件并写入向量。`READONLY` 适合读取已有向量存储，`EXTERNAL` 需要应用提供对应的外部 provider。

## 第三步：上传文档

打开刚创建的知识库，点击「Upload」选择一个文件。单次上传一个文件，支持以下扩展名：

```text
.pdf .pptx .doc .docx .xls .xlsx .xlsm .txt .md .json .csv
```

单个文件最大为 100 MiB。上传时不需要选择存储 disk——服务端会使用知识库配置的 disk 保存文件。

上传完成后，文档会进入异步处理队列，依次完成解析、分段、Embedding 和向量写入。刷新文档列表，直到状态变为 `SUCCESS`；如果变为 `ERROR`，先查看错误信息，修复 Embedding、队列或文件配置后再重试。

:::tip 异步处理

上传接口返回的是已经保存的文档，不代表向量已经生成。只有文档处理成功后，命中测试才有稳定的检索结果。

:::

## 第四步：运行命中测试

在知识库详情页打开「Hit test」或「Retrieval」区域，输入文档中确实出现过的一句话或一个明确概念，提交测试。

重点检查：

- 是否返回预期的文档
- `score` 是否达到当前阈值
- 返回内容是否来自正确的段落
- 返回结果数量是否符合 `Top K`
- 文档状态是否已经是 `SUCCESS`

建议先用文档中的原句测试，再用同义表达测试。如果原句都检索不到，优先检查文档状态、Embedding 模型、向量数据库连接和知识库是否启用。

至此，知识库已经可以被 AI 员工的 RAG 检索使用。

## 常见问题

| 现象                         | 优先检查                                         |
| ---------------------------- | ------------------------------------------------ |
| 向量数据库没有出现在创建表单 | `config.yml` 层级、provider 拼写、配置是否重载   |
| 上传成功但没有检索结果       | 文档是否完成异步处理，状态是否为 `SUCCESS`       |
| 检索一直为空                 | 知识库是否启用，Embedding service/model 是否可用 |
| 连接测试失败                 | PostgreSQL 地址、账号、`vector` 扩展和网络访问   |
| 配置管理的向量数据库不能编辑 | 这是预期行为，修改 `config.yml` 后重载配置       |

## 相关链接

- [向量数据库](../management/vector-database.md) — 了解 PGVector 字段和变更影响
- [配置和管理知识库](../management/knowledge-bases.md) — 维护知识库、文档和分段
- [AI 员工 RAG 检索](./agent-rag.md) — 把知识库接入 AI 员工
