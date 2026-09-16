---
title: '注册 Skill'
description: '使用 SKILL.md 为 AI 员工提供可复用的工作方法，并绑定已注册 Tool。'
keywords: 'AI Skill,SKILL.md,SkillsLoader,ai.skills.paths,NocoBase'
---

# 注册 Skill

**Skill** 是提供给模型的工作说明。它适合保存可复用的步骤、判断规则和输出约束，也可以声明完成这项工作时需要启用哪些 Tool。Skill 不负责绕过 Tool 权限，实际数据访问仍由 Tool 和运行时控制。

## 创建 `SKILL.md`

在 `ai/skills/customer-follow-up/SKILL.md` 中写入 frontmatter 和正文：

```md
---
name: customer-follow-up
description: Review customer context and prepare a practical follow-up plan.
scope: SPECIFIED
introduction:
  title: Customer follow-up
  about: Review account context and prepare the next action.
tools:
  - find-customer
---

# Customer follow-up

## Procedure

1. Read the customer record with `find-customer`.
2. Separate confirmed facts from missing information.
3. Identify the current lifecycle stage and unresolved commitments.
4. Propose one primary next action and one fallback.
5. Never invent dates, owners, prices, or customer statements.
```

`name` 和 `description` 必填。`scope` 支持 `SPECIFIED`、`GENERAL` 和 `CUSTOM`，省略时默认是 `SPECIFIED`。`tools` 中填写 Tool 的注册名，不要填写文件路径。

## Skill 怎样被加载

AI 员工插件按下面的顺序加载 Skill 目录：

1. 插件发布包自带的 `ai/skills`
2. 应用根目录的 `ai/skills`
3. `config.yml` 中 `ai.skills.paths` 指定的目录

后加载的目录具有更晚的注册语义。配置路径可以是绝对路径，也可以相对于应用根目录；空路径和重复路径会被忽略，不存在的目录只记录 warning。

如果 Skill 还带有只为自己服务的 Tool，可以放在同一目录的 `tools/**/*.ts` 或 `tools/**/*.js`。`SkillsLoader` 会发现这些文件，并把它们的名称合并到 Skill 的 `tools` 列表中。应用级共享 Tool 仍应放在 `server/ai/tools` 并显式注册。

## 绑定给员工

在 Employee 定义中使用 Skill 的 `name`：

```ts
export default defineAIEmployee({
  username: 'customer-success',
  skills: ['customer-follow-up'],
  chatSettings: { enableSkills: true },
});
```

修改 `SKILL.md` 后重启开发服务。AI 配置重载只同步 LLM 和 MCP 配置，不会重新扫描静态 Skill 文件。

## 相关链接

- [定义自己的 AI 员工](./index.md) — 了解资源加载顺序
- [注册 AI 员工](./employee.md) — 把 Skill 绑定给员工
- [注册 Tool](./tool.md) — 实现 Skill 所需的后端能力
- [配置参考](../configuration/index.md) — 添加额外 Skill 目录
