---
title: '附件存储配置'
description: '配置 AI 员工上传附件使用的 NocoBase 文件存储磁盘。'
keywords: 'AI Employee,storage,disk,attachment,NocoBase file storage'
---

# 附件存储配置

聊天框启用 `enableAttachments` 后，用户可以选择文件、拖放文件或粘贴图片。AI 员工不直接写本地路径，而是使用 NocoBase 文件存储中已经注册的 Disk，并单独保存附件元数据。

## 配置员工附件 Disk

```yaml
ai:
  aiEmployee:
    storage:
      disk:
        - ai-files
```

`disk` 是字符串数组。AI Employee 附件目前使用第一个有效 Disk；空字符串和重复值会被忽略。`ai-files` 必须已经存在于应用的文件存储配置中。

## 共享默认值

多个 AI 能力使用同一存储时，可以声明共享 Disk：

```yaml
ai:
  storage:
    disk:
      - shared-ai-files
```

AI Employee 附件按下面的优先级选择磁盘：

1. `ai.aiEmployee.storage.disk` 的第一个有效值
2. `ai.storage.disk` 的第一个有效值
3. 应用默认文件存储 Disk

如果同时使用 AI 知识库，知识库有自己的 `ai.aiKnowledgeBase.storage.disk` 配置和多 Disk 语义，不要用员工附件规则推断知识库行为。

## 运行注意事项

- Disk 的根目录、对象存储凭据和访问策略在 NocoBase 文件存储中配置
- 上传内容可能包含敏感业务数据，应设置合适的访问、保留和清理策略
- 模型是否支持图片或其他附件，还取决于当前 Provider 和模型
- 修改 Disk 配置后，先验证新上传；已有附件仍保留原存储元数据

## 相关链接

- [聊天框](../components/chat.md) — 开启附件按钮
- [配置概览](./index.md) — 查看完整 `ai` 配置结构
