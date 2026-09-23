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

**员工 Skill 只有一个文件。** 模型通过 `getSkill` 加载 Skill 时，拿到的只是 `SKILL.md` 的正文，而且没有能读文件的 Tool，所以正文里指向 `references/` 的链接，模型打不开。完成这项工作需要的内容都写进 `SKILL.md` 正文；`references/` 里的页面只给维护它的人看。

## Skill 怎样被加载

AI 员工插件按下面的顺序加载 Skill 目录：

1. 插件发布包自带的 `ai/skills`
2. 应用根目录的 `ai/skills`
3. `config.yml` 中 `ai.skills.paths` 指定的目录

后加载的目录具有更晚的注册语义。配置路径可以是绝对路径，也可以相对于应用根目录；空路径和重复路径会被忽略，不存在的目录会被跳过。

应用根目录在开发和部署时不是同一个目录：开发时是源码根目录，构建后的服务从 `dist/` 运行，相对路径会指向 `dist/` 里的目录，而构建不会复制它，于是这个目录被悄悄跳过。构建只会把应用自己的 `ai/skills` 里的 Markdown 复制到 `dist/ai/skills`。部署环境请在 `ai.skills.paths` 里写部署环境自己提供的绝对路径。

Skill 目录不定义 Tool。`SkillsLoader` 会扫描 Skill 目录下的 `tools/**/*.ts` 和 `tools/**/*.js`，但只取文件名追加到 `tools` 列表里，文件本身不会被注册；构建也只复制 Markdown，这些名称到了部署环境就没有了。如果某个名称恰好和已注册的 Tool 同名，这个 Tool 在开发环境会被 Skill 屏蔽，在生产环境却不会。所以 Tool 一律放在 `server/ai/tools` 并在代码里注册，再在 frontmatter 的 `tools` 里写出它的名称。

## 绑定给员工

在 Employee 定义中使用 Skill 的 `name`：

```ts
export default defineAIEmployee({
  username: 'customer-success',
  skills: ['customer-follow-up'],
  chatSettings: { enableSkills: true },
});
```

修改 `SKILL.md` 后重启服务。

## 相关链接

- [定义自己的 AI 员工](./index.md) — 了解资源加载顺序
- [注册 AI 员工](./employee.md) — 把 Skill 绑定给员工
- [注册 Tool](./tool.md) — 实现 Skill 所需的后端能力
- [配置参考](../configuration/index.md) — 添加额外 Skill 目录
