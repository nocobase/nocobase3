---
title: '预载文件到知识库'
description: '使用 Manifest.yml 声明知识库、文件清单和启动配置，在 NocoBase 中预载文件并支持追加和恢复。'
keywords: 'AI 知识库,Manifest.yml,预载文件,append,recover,config.yml'
---

# 预载文件到知识库

如果知识库的文件来自应用部署包、初始化资源或指定的文件存储 disk，可以使用 `Manifest.yml` 声明文件清单，让 NocoBase 在启动时自动导入。这个能力由 `server/manifest-bootstrap.ts` 读取 `config.yml` 中的 Manifest 地址，再交给 Manifest service 处理。

## 文件目录和 disk

Manifest 文件本身和被导入的文件都通过 NocoBase Drive 访问。`config.yml` 里的路径是相对于 disk 的 Drive object key，不是服务器的绝对文件系统路径。

比如，在名为 `local` 的 disk 中准备以下对象：

```text
preload/knowledge-base/product-manuals/manifest.yml
preload/knowledge-base/product-manuals/manual.pdf
preload/knowledge-base/product-manuals/faq.md
```

## 在 `config.yml` 声明 Manifest 地址

```yaml
ai:
  aiKnowledgeBase:
    manifests:
      - disk: local
        locations:
          - preload/knowledge-base/product-manuals/manifest.yml
```

`disk` 是存放 Manifest 的 disk，`locations` 是一个或多个 Manifest object key。开头的 `/` 会被去掉；不要填写宿主机绝对路径，也不要绕过 Drive 直接访问存储服务商 SDK。

## 编写 `Manifest.yml`

一个 Manifest 对象必须包含 `key`、`operation` 和 `files`。首次初始化使用 `operation: init`，还必须提供 `initiate`：

```yaml
key: product-manuals
operation: init
initiate:
  disk: local
  name: 产品手册
  vectorDatabase: pgvector-main
  llmService: embedding-service
  embeddingModel: text-embedding-3-small
files:
  - disk: local
    locations:
      - preload/knowledge-base/product-manuals/manual.pdf
      - preload/knowledge-base/product-manuals/faq.md
```

其中：

- `key` 是知识库的稳定 key
- `initiate.disk` 是新建 LOCAL 知识库保存文件的目标 disk
- `name` 是知识库显示名称
- `vectorDatabase` 引用已经启用的向量数据库 key
- `llmService` 和 `embeddingModel` 指定 Embedding 配置
- `files` 是文件组列表，每组指定来源 disk 和文件 object key

文件路径同样必须是 disk-relative key。文件格式和大小限制跟管理页面上传一致。

## 三种操作

### `init`

`init` 在知识库不存在时创建一个 `LOCAL` 知识库，并导入未完成的文件。如果同一个 key 已经被无关知识库占用，初始化不会覆盖它。

### `append`

`append` 要求目标 `LOCAL` 知识库已经存在，用于向已有知识库追加文件。示例：

```yaml
key: product-manuals
operation: append
files:
  - disk: local
    locations:
      - preload/knowledge-base/product-manuals/new-release.md
```

### `recover`

`recover` 用来源 disk 和精确 object key 找到之前导入的文件。如果文件内容没有变化，则跳过；如果内容发生变化，则保留原 document ID 和 key，删除旧向量和分段，替换文件内容并再次派发向量化。

```yaml
key: product-manuals
operation: recover
files:
  - disk: local
    locations:
      - preload/knowledge-base/product-manuals/manual.pdf
```

不要只依赖文件名匹配。恢复逻辑使用知识库 key、来源 disk 和来源 location 的精确映射。

## 幂等和处理状态

Manifest 的处理记录由 Manifest 来源（配置来源 disk 加标准化 location）确定。已经成功的来源会被视为终态，即使之后修改 YAML，也不会自动重放；需要一次新的逻辑导入时，使用新的 Manifest location。

失败或中断的来源会读取已经保存的快照，只继续处理未成功的文件。单个文件在源对象和元数据保存成功、并成功派发向量化任务后才算成功；Manifest 不会等待分段和向量写入完成。

因此，启动日志中的 Manifest `SUCCESS` 不等同于每篇文档已经完成向量化。仍需到管理页面检查文档状态。

## 启动后检查

1. 确认 `config.yml` 的 disk 和路径存在
2. 确认向量数据库、LLM service 和 embedding model 已启用
3. 重启或重载应用配置
4. 在「Knowledge Base」页签确认知识库和文档出现
5. 等待文档状态变为 `SUCCESS`
6. 运行命中测试

## 相关链接

- [建立第一套知识库](./index.md) — 手动配置并验证第一条检索链路
- [向量数据库](../management/vector-database.md) — 配置 Manifest 所引用的 PGVector
- [配置和管理知识库](../management/knowledge-bases.md) — 检查预载文档和处理状态
