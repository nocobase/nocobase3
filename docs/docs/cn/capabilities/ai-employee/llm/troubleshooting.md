---
title: '排查 LLM 调用问题'
description: '处理 AI 员工模型列表为空、调用失败和配置未生效等常见问题。'
keywords: 'LLM 排查,AI 员工,API Key,模型调用'
---

# 排查 LLM 调用问题

这里整理配置 LLM 时比较容易遇到的问题。如果你遇到“服务看起来已经配置，但 AI 员工无法调用”，可以先按表格检查。

## 模型列表为空

依次检查：

1. `config.yml` 是否使用了 `ai.llmServices`
2. YAML 缩进是否正确
3. `name` 和 `provider` 是否为空或重复
4. `enabledModels` 是否包含 `label` 和 `value`
5. 是否重新加载了应用配置
6. 管理后台中的服务和模型是否已启用

## 调用返回认证错误

通常是 API Key 没有注入，或者 Key 对应的 provider 不正确。检查环境变量是否存在，但不要把 Key 打印到日志：

```bash
printenv OPENAI_API_KEY >/dev/null && echo 'OPENAI_API_KEY 已设置'
```

如果使用 `${OPENAI_API_KEY}`，变量名必须和部署环境中的名称完全一致。

## 调用返回模型不存在

检查 `enabledModels[].value`。`label` 只是给人看的名称，provider 实际使用的是 `value`。

比如下面的配置中，发送给 provider 的是 `deepseek-chat`：

```yaml
enabledModels:
  - label: DeepSeek Chat
    value: deepseek-chat
```

## 修改后仍然使用旧配置

应用会在配置加载时同步 LLM 服务。修改后重新加载配置；如果当前部署方式不支持热加载，重启应用进程。

另外，已经创建的会话可能保留原来的模型设置。测试新配置时，创建一个新会话更容易确认结果。

## AI 员工可以看到模型，但不能调用

检查员工的模型限制、当前用户权限和服务启用状态。员工可见不代表当前用户一定有权使用该模型。

:::warning 注意

不要通过扩大员工权限来解决 provider 认证错误。先确认服务配置、环境变量和模型 ID，再检查业务权限。

:::

## 相关链接

- [配置 LLM](./index.md) — 配置服务和模型
- [管理 AI 员工](../management/index.md) — 管理员工的模型限制
