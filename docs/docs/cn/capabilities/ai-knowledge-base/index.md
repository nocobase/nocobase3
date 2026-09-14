---
title: 'AI 知识库'
description: '使用 NocoBase 专业版 AI 知识库插件配置向量数据库、维护知识库、上传文档并为 AI 员工启用 RAG 检索。'
keywords: 'NocoBase,AI 知识库,专业版,RAG,向量数据库,AI 员工'
---

# AI 知识库

在 NocoBase 中，**AI 知识库**是专业版能力。启用 `@nocobase/app-plugin-ai-knowledge-base` 后，你可以把企业文档导入知识库，经过分段和 Embedding（向量化）处理后，为 AI 员工提供 RAG（检索增强生成）检索内容。

## 添加插件

AI 知识库插件属于 NocoBase 专业版插件。在应用根目录执行：

```bash
pnpm plugin:register ai-knowledge-base
```

## 快速索引

| 我想要……                            | 去哪里看                                              |
| ----------------------------------- | ----------------------------------------------------- |
| 配置 PGVector、创建知识库并验证检索 | [建立第一套知识库](./quick-start/index.md)            |
| 预载文件并在启动时初始化知识库      | [预载文件到知识库](./quick-start/preload-manifest.md) |
| 为 AI 员工配置 RAG 检索             | [AI 员工 RAG 检索](./quick-start/agent-rag.md)        |
| 在管理后台维护知识库、文档和分段    | [配置和管理知识库](./management/knowledge-bases.md)   |
| 配置和维护向量数据库                | [向量数据库](./management/vector-database.md)         |

## 从哪里开始

先阅读「[建立第一套知识库](./quick-start/index.md)」完成一次端到端配置。需要维护知识库内容时，阅读「[管理与运维](./management/knowledge-bases.md)」。

## 相关链接

- [建立第一套知识库](./quick-start/index.md) — 从向量数据库配置到命中测试完成第一条检索链路
- [预载文件到知识库](./quick-start/preload-manifest.md) — 用 `Manifest.yml` 声明启动时导入的文件
- [AI 员工 RAG 检索](./quick-start/agent-rag.md) — 配置检索范围、策略、Top K 和 Score
- [配置和管理知识库](./management/knowledge-bases.md) — 创建知识库、上传文档和维护分段
- [向量数据库](./management/vector-database.md) — 配置 PGVector 和处理变更影响
