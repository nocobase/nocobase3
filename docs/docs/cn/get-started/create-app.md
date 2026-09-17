---
title: '创建应用'
description: '使用 pnpm 创建 NocoBase 3 应用，选择 SQLite 并启动本地开发服务。'
---

# 创建应用

这一步会生成一个独立项目，并在本机启动。先用 SQLite，不需要额外安装数据库服务。

## 准备环境

安装 Node.js 24 和 pnpm 11。在终端检查是否可用：

```bash
node --version
pnpm --version
```

项目生成后，使用项目 `package.json` 中指定的 pnpm 版本。以下命令在 Linux / WSL 的终端执行，Windows 用户可以在 WSL 中完成这一轮操作。

## 创建项目

进入准备存放应用的目录，运行：

```bash
npm_config_registry=https://npm.nocobase.ai pnpm create @nocobase/app docs-demo --db-dialect=sqlite
```

`docs-demo` 是新目录名，可以换成自己的名字。每个应用使用独立目录，不要覆盖已有项目。

命令会下载应用模板、生成项目和配置文件、安装依赖，并同步插件的开发指引。等待终端显示完成，再进入下一步。

当前包从 NocoBase 的包源下载，所以命令中保留 `npm_config_registry`。如果使用其他包源后出现找不到 `@nocobase/create-app`，先确认这一项。

生成的 `config.yml` 包含当前应用配置和密钥，保留在本地，不提交到代码仓库。使用生成的 SQLite 配置即可启动，数据保存在应用自己的存储目录中。

## 启动应用

进入刚创建的目录，启动开发服务：

```bash
cd docs-demo
pnpm dev
```

保持终端运行，打开它打印的 `Local` 地址。比如 `http://127.0.0.1:13000/main/`；端口被占用时可能变化，以你的终端输出为准。

浏览器会进入登录页：

![新应用的登录页面](https://static-docs.nocobase.com/nb3-docs-20260916-login-en.png)

模板会在新数据库中创建初始管理员：

| 项目 | 初始值               |
| ---- | -------------------- |
| 邮箱 | `admin@nocobase.com` |
| 密码 | `admin123`           |

这组账号用于本地首次体验。对外开放应用前，应更改初始密码并配置正式访问方式。已有数据库中的账号以实际设置为准。

登录后会看到应用首页。通过右上角账户菜单的「Language / 语言」可切换为中文。

![登录后应用首页，示例已添加订单菜单](https://static-docs.nocobase.com/nb3-docs-20260916-home-cn.png)

图中的「订单管理」是下一页添加的功能，新创建的应用暂时没有这个菜单。

## 停止和再次启动

在运行服务的终端按 `Ctrl+C` 停止。下次进入同一个应用目录，再运行 `pnpm dev`。不需要重新执行创建命令；已有数据库也不需要重新生成。

开发时使用 `pnpm dev`。`pnpm build` 和 `pnpm start` 用于构建后运行，首次跟随文档先保持开发模式。

## 遇到问题

- **提示目录已存在**：换一个新目录名，或进入原项目继续操作，不要为了重试删除已有应用。
- **依赖安装没有完成**：先查看终端的错误；如果项目已经生成，在项目目录修复问题并重新运行 `pnpm install`，再执行 `pnpm plugin:skills:sync`。
- **打开地址失败**：确认终端仍在运行，复制它实际打印的地址。如果浏览器与应用不在同一台机器，需要先配置相应端口访问。
- **类型检查显示同名包来自两个版本**：检查依赖树中是否安装了同一个包的多个版本。可以在应用目录执行 `pnpm dedupe` 合并兼容的重复依赖，再运行类型检查。

## 下一步

用已配置好的AI Agent打开这个项目目录，让它先读取项目的 `AGENTS.md` 和相关开发指引，再继续[让 AI Agent 做第一个功能](./first-feature)。AI Agent 本身的安装、账号登录和模型访问需要事先准备好。
