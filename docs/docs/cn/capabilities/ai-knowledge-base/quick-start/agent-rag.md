---
title: '配置 AI 员工知识库检索'
description: '在 AI 员工配置页面启用知识库检索，设置检索策略、提示词、Top K 和 Score。'
keywords: 'AI 员工,RAG,知识库,Knowledge Base,Retrieval strategy,Top K,Score'
---

# 配置 AI 员工知识库检索

在 NocoBase 中，**RAG（检索增强生成）**让 AI 员工先从知识库召回相关内容，再把检索结果放入 Prompt，最后由 LLM 生成回答。

进入 AI 设置页面，选择一个 AI 员工并点击「Edit」。在编辑抽屉中打开「Knowledge Base」页签。

## 配置项

### Enable

打开「Enable」后，AI 员工才会在对话中使用知识库检索。

### Knowledge Base

选择一个或多个知识库。留空时，AI 员工会从所有已启用的知识库中检索；选择知识库后，只检索选中的知识库。

### Retrieval strategy

- `Retrieve on demand`：由 AI 员工判断当前问题是否需要知识库。新建员工默认使用这个策略，通常来说也是推荐选项
- `Automatically retrieve for every question`：每个问题都先执行检索，适合每轮对话都依赖内部资料的员工

### Knowledge Base Prompt

这个字段决定检索内容如何注入 AI 员工的上下文。必须保留固定占位符 `{knowledgeBaseData}`，不要删除或修改它。

可以在占位符前后补充回答要求，比如要求员工引用文档名称、区分已知信息和推测信息。

### Top K

每次检索返回的最多结果数，范围为 1–100，默认值为 3。值越大，LLM 看到的候选内容越多，Token 消耗也可能增加。

### Score

检索结果的最低相似度阈值，范围为 0–1，默认值为 0.6。值越高，结果通常越相关，但也可能因为阈值过高而没有结果。

建议先使用默认值，再通过命中测试和真实问题逐步调整。

## 调整检索效果

按下面的顺序调试：

1. 先用知识库中的原句做命中测试
2. 确认文档状态为 `SUCCESS`
3. 确认 AI 员工选择的知识库已经启用
4. 从默认 `Top K = 3` 和 `Score = 0.6` 开始调整
5. 再测试同义表达和真实业务问题

如果原句都检索不到，优先检查文档状态、向量数据库和 Embedding 配置，不要先调低 Score。

## 相关链接

- [建立第一套知识库](./index.md) — 配置向量数据库、上传文档并完成命中测试
- [配置和管理知识库](../management/knowledge-bases.md) — 创建知识库并维护文档
- [向量数据库](../management/vector-database.md) — 检查向量存储和 Embedding 前置条件
