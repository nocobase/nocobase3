---
title: 'LLM 服务管理'
description: '在 AI Employee 设置页查看 LLM 服务、启用服务并选择 Provider 或自定义模型。'
keywords: 'LLM Service,Provider models,custom models,Enabled,NocoBase'
---

# LLM 服务管理

「LLM Service」Tab 列出 `config.yml` 已声明的服务。表格显示 UID、标题、Provider、开放模型和 Enabled 状态；连接密钥不会显示在浏览器中。

![编辑 LLM 服务模型](https://static-docs.nocobase.com/20260914111142-ai-employee-llm-services.png)

## 启用或停用服务

使用每行右侧的 Enabled 开关控制服务是否可供员工使用。切换失败时，页面会恢复原值并显示错误。

修改 `config.yml` 后，同名服务会更新 Provider、标题和连接参数，但管理页保存的 Enabled 状态和模型列表会保留。新增服务使用配置中的初始值。

## 选择 Provider 模型

点击 Models 前的编辑图标，选择「Select models」。搜索框会调用当前 Provider 的模型列表接口；选中的模型保存为 Provider 模式。

如果列表加载失败，检查 API Key、`baseURL`、网络连通性和 Provider 注册键。Embedding 模型不需要添加到聊天模型列表。

## 手动输入模型

Provider 无法列出模型，或者要使用自定义网关模型时，选择「Manual input」，为每个模型填写：

- Model ID：真正发送给 Provider 的值
- Display name：界面中显示的名称

同一个服务内 Model ID 应保持唯一。保存后，再到 AI Employee 的 Model settings 中把它分配给指定员工。

## 配置职责

管理页只维护 Enabled 和模型列表。服务 `name`、Provider、API Key、Base URL 和默认模型参数仍由 `config.yml` 管理。不要把密钥放进前端代码或浏览器配置。

## 相关链接

- [LLM 服务配置](../configuration/llm.md) — 查看全部 Provider 和字段
- [快速开始](../quick-start.md) — 创建第一个服务
- [AI 员工管理](./employees.md) — 限制员工可用模型
