---
pageType: home
pageName: home
title: 'NocoBase 3 文档'
description: 'NocoBase 3 是面向 AI 协作的业务系统开发基座。创建应用后源码归你所有，让 AI 直接写业务代码，用成熟插件覆盖认证、权限、工作流、通知等通用能力。'
keywords: 'NocoBase,NocoBase 3,AI 开发,业务系统,低代码,开源'
hero:
  name: NocoBase 3 文档
  text: 和 AI 一起，搭建稳定的业务系统
  actions:
    - theme: brand
      text: 快速上手
      link: /get-started/
    - theme: alt
      text: GitHub
      link: https://github.com/nocobase/nocobase

features:
  - title: 开始
    details: 创建一个属于你的应用，跑起来，十分钟内看到第一个页面。
    items:
      - title: NocoBase 3 是什么
        details: 一个命令生成完整的应用源码，前后端、数据库、AI 协作约定都在里面，从此这份代码归你。
        link: /get-started/
      - title: 创建应用
        details: 用 pnpm create @nocobase/app 生成项目，选择数据库，启动开发服务器。
        link: /get-started/create-app
      - title: 项目结构
        details: client、server、database 各放什么，三个 composition root 如何决定应用由什么组成。
        link: /get-started/project-structure
      - title: 第一个功能
        details: 建一张表、加一个接口、写一个页面，把完整链路走通一遍。
        link: /get-started/first-feature

  - title: 应用开发
    details: 业务代码写在你自己的源码里。项目自带 AI 协作约定，让 AI 写出的代码和你手写的保持一致。
    items:
      - title: 让 AI 参与开发
        details: AGENTS.md 定规则，skills 提供细则，AI 按项目约定写代码，而不是凭空猜测。
        link: /app/ai-development
      - title: 页面与路由
        details: 声明路由、编写页面组件、注册导航入口，以及登录态与设置页的处理。
        link: /app/pages-and-routes
      - title: 界面与样式
        details: 基于 shadcn/ui 组合界面，用语义化 Tailwind 令牌保持明暗主题一致。
        link: /app/components-and-styling
      - title: API 接口
        details: 定义 HTTP 端点、Webhook 与回调，并为每条路由配置自己的认证与鉴权。
        link: /app/server-routes
      - title: 数据读写
        details: 在运行时解析数据库、执行查询与写入、处理事务。
        link: /app/database
      - title: 数据库迁移
        details: 用迁移记录表结构变更，用种子数据准备应用必需的初始数据。
        link: /app/migrations
      - title: 服务与后台任务
        details: 把领域逻辑收敛成服务在多处复用，以及运行后台任务和定时任务。
        link: /app/services-and-jobs
      - title: 更多...
        details: 国际化、测试与验证、AI 员工等更多主题。
        link: /app/

  - title: 内置能力
    details: 认证、权限、工作流这类通用需求，装上插件就有，不必自己从头实现。
    items:
      - title: 使用插件
        details: 一条命令完成安装与接线，插件的技能文档会同步到项目里供 AI 查阅。
        link: /plugins/
      - title: 认证与权限
        details: 登录注册、会话、角色与数据权限。
        link: /plugins/auth
      - title: 工作流
        details: 审批、多步流程，以及跨越单次请求的业务规则。
        link: /plugins/workflow
      - title: 更多...
        details: 文件存储、通知、国际化，以及如何开发可复用的插件。
        link: /plugins/

  - title: 部署
    details: 从本地开发到线上运行。
    items:
      - title: 应用配置
        details: config.yml、环境变量，以及如何查看应用实际解析到的配置。
        link: /deployment/configuration
      - title: 构建与运行
        details: 构建生产产物并独立运行，或用 Docker 部署。
        link: /deployment/standalone
      - title: Hub
        details: 用 Hub 创建、启动和托管应用，把开发完成的应用部署上去。
        link: /deployment/hub
---
