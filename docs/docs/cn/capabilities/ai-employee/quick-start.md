---
title: '快速开始'
description: '为 NocoBase 应用配置第一个 LLM 服务，并使用内置组件创建全局 AI 对话入口。'
keywords: 'NocoBase,AI 员工,快速开始,config.yml,LLM,全局对话'
---

# 快速开始

这条路径使用 NocoBase 内置的 AI 员工和前端组件，不要求你先编写自己的员工。完成 LLM 配置、确认模型和创建全局入口后，就可以开始对话。

## 前置条件

- 已使用 `pnpm create @nocobase/app <目录名>` 创建应用，并在应用目录中运行过 `pnpm config:init`
- 应用可以通过 `pnpm dev` 启动
- `@nocobase/app-plugin-ai-employee` 已在应用的 Server 和 Client 插件列表中注册
- 已准备 LLM 服务的 API Key
- 当前账号可以访问 `/settings/ai`

## 创建应用

创建并进入应用目录：

```bash
pnpm create @nocobase/app ai-workspace
cd ai-workspace
pnpm config:init
```

创建命令生成完整的应用源码并安装依赖，`pnpm config:init` 生成 `config.yml`（默认使用 SQLite，并填入随机密钥）。确认初始应用能够通过 `pnpm dev` 启动，然后继续配置 AI。

## 第一步：声明 LLM 服务

打开应用根目录的 `config.yml`，在 `ai.llmServices` 中添加服务。下面使用名为 `gpt` 的 OpenAI 服务，并把密钥留给环境变量注入。

```yaml
ai:
  llmServices:
    - name: gpt
      title: GPT
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabledModels:
        - label: GPT-5.6
          value: gpt-5.6
      enabled: true
```

`name` 是 NocoBase 内部引用这个服务的稳定标识，`provider` 是内置 Provider 的注册名。`enabledModels[].value` 必须使用服务商接受的真实模型 ID；如果当前账号不能使用示例中的 `gpt-5.6`，请替换成实际可用的模型。

你也可以先不写 `enabledModels`：

```yaml
ai:
  llmServices:
    - name: gpt
      title: GPT
      provider: openai
      options:
        apiKey: ${OPENAI_API_KEY}
      enabled: true
```

省略 `enabledModels` 后，服务使用 Provider 模型模式。服务启动后，再到管理页搜索并选择要开放的模型。

## 第二步：配置密钥并重启

密钥不能进入仓库，也不能被提交。动手之前，先确认 `config.yml` 和 `.env` 都被 Git 忽略并且没有被跟踪。刚创建的应用还不是 git 仓库时，先在应用根目录执行 `git init`。下面每一行输出 `ok` 才能继续：

```bash
git check-ignore -q config.yml && ! git ls-files --error-unmatch config.yml >/dev/null 2>&1 && echo "config.yml ok" || echo "config.yml 未被忽略，停止"
git check-ignore -q .env && ! git ls-files --error-unmatch .env >/dev/null 2>&1 && echo ".env ok" || echo ".env 未被忽略，停止"
```

`config.example.yml` 会入库，所以无论用哪种方式，它都只写 `${OPENAI_API_KEY}`，不写真实的值。

密钥可以放在三个地方，按推荐顺序排列：

| 方式                        | 密钥在哪里               | `config.yml` 写什么 | 适用范围                                     |
| --------------------------- | ------------------------ | ------------------- | -------------------------------------------- |
| 推荐：系统环境变量          | 本机或部署环境的环境变量 | `${OPENAI_API_KEY}` | 开发和部署逻辑一致                           |
| 其次：直接写入 `config.yml` | `config.yml`             | 密钥的值            | 开发和部署都可用，前提是 `config.yml` 不入库 |
| 最后：`.env`                | 应用根目录的 `.env`      | `${OPENAI_API_KEY}` | **当前版本只有 `pnpm dev` 支持**             |

下面的命令都要在你自己的终端里运行。命令运行后会提示 `OpenAI API Key:`，粘贴密钥后回车即可；输入时屏幕上不会显示，密钥也不会出现在命令行和 shell 历史里。不要把密钥发给 AI 助手，也不要让它代你执行这些命令，否则密钥会留在对话记录里。

这些命令在 zsh、bash 下实测过：配置文件不存在时会新建，并且只有你自己可读；配置文件是软链接时，写入链接指向的文件，不会替换链接本身；其他行原样保留，同名的旧设置会被替换，重复执行也只留下一行；密钥里有引号、`$`、反斜杠或反引号时也能原样读回。命令不依赖你设置的 alias。

**系统环境变量。** 按你使用的 shell 选一条：

```bash
# zsh（会读取 ZDOTDIR 指定的目录）
f="${ZDOTDIR:-$HOME}/.zshrc"; read -rs 'v?OpenAI API Key: '; echo; [ -e "$f" ] || (umask 077; command touch "$f"); q=$(command printf '%s' "$v" | command sed "s/'/'\\\\''/g"); k=$(command grep -v '^export OPENAI_API_KEY=' "$f"); command printf "%s\nexport OPENAI_API_KEY='%s'\n" "$k" "$q" > "$f"; unset v q k; source "$f"

# bash（Linux）
f=~/.bashrc; read -rsp 'OpenAI API Key: ' v; echo; [ -e "$f" ] || (umask 077; command touch "$f"); q=$(command printf '%s' "$v" | command sed "s/'/'\\\\''/g"); k=$(command grep -v '^export OPENAI_API_KEY=' "$f"); command printf "%s\nexport OPENAI_API_KEY='%s'\n" "$k" "$q" > "$f"; unset v q k; source "$f"

# bash（macOS）：终端启动的是登录 shell，依次查找 ~/.bash_profile、~/.bash_login、~/.profile，写入第一个存在的文件，都不存在时新建 ~/.bash_profile
f=~/.bash_profile; for c in ~/.bash_profile ~/.bash_login ~/.profile; do [ -e "$c" ] && { f=$c; break; }; done; read -rsp 'OpenAI API Key: ' v; echo; [ -e "$f" ] || (umask 077; command touch "$f"); q=$(command printf '%s' "$v" | command sed "s/'/'\\\\''/g"); k=$(command grep -v '^export OPENAI_API_KEY=' "$f"); command printf "%s\nexport OPENAI_API_KEY='%s'\n" "$k" "$q" > "$f"; unset v q k; source "$f"
```

```powershell
# Windows PowerShell：写入当前用户的环境变量，对之后新开的终端生效
$k = Read-Host 'OpenAI API Key' -AsSecureString; [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', [System.Net.NetworkCredential]::new('', $k).Password, 'User'); Remove-Variable k
# 然后在新开的终端里确认
if ($env:OPENAI_API_KEY) { 'OPENAI_API_KEY 已设置' } else { 'OPENAI_API_KEY 未设置' }
```

也可以不用命令：在 Windows 的「编辑账户的环境变量」对话框里新建 `OPENAI_API_KEY`，或者用编辑器在 shell 配置文件里加一行 `export OPENAI_API_KEY='你的密钥'`（密钥里有单引号时写成 `'\''`）。

可以用下面的命令确认变量已经生效，它不会打印密钥本身：

```bash
[ -n "$OPENAI_API_KEY" ] && echo "OPENAI_API_KEY 已设置" || echo "OPENAI_API_KEY 未设置"
```

`source` 只对执行它的那个终端生效。其他已经打开的终端和正在运行的进程仍然使用启动时的环境，AI 助手的终端也一样：在当前会话里新设的变量，AI 助手启动的 `pnpm dev` 读不到，`${OPENAI_API_KEY}` 会展开成空字符串。所以要么在你自己的终端里启动服务，要么从已经有这个变量的终端重新打开 AI 助手的会话。

**直接写入 `config.yml`。** 先把 `apiKey` 写成单引号包起来的占位标记 `apiKey: 'REPLACE_WITH_OPENAI_API_KEY'`，再运行下面的命令。它按 YAML 单引号字符串的规则写入密钥（单引号写成两个），读回来就是原值：

```bash
command printf 'OpenAI API Key: '; stty -echo; IFS= read -r v; stty echo; echo; KEY="$v" command perl -pi -e 's/REPLACE_WITH_OPENAI_API_KEY/(my $k = $ENV{KEY}) =~ s{\x27}{\x27\x27}g; $k/ge' config.yml; unset v
```

选择这种方式意味着 AI 助手之后每次修改 `config.yml`（添加 MCP 服务、附件存储或其他 LLM 服务）都会读到密钥，密钥会因此进入对话记录，所以它排在第二位。

**`.env`。** 当前版本中，只有 `pnpm dev` 会把 `.env` 合并进服务进程的环境；构建后的服务（`pnpm start` 和部署环境）读不到它，`${OPENAI_API_KEY}` 会展开成空字符串。这个问题会在后续版本处理。

`.env` 里的值即使加了引号，`$NAME` 和 `${NAME}` 也会被展开成环境变量，`\n`、`\r` 会被转成换行。下面的命令把值用单引号包起来，并把会被展开的 `$` 写成 `\$`；密钥里如果恰好有「反斜杠加 n 或 r」，`.env` 无法保存，命令会提示你改用系统环境变量：

```bash
command printf 'OpenAI API Key: '; stty -echo; IFS= read -r v; stty echo; echo; case $v in *'\n'*|*'\r'*) command printf '%s\n' '这个密钥含有反斜杠加 n 或 r，.env 无法保存，请改用系统环境变量。';; *) f=.env; [ -e "$f" ] || (umask 077; command touch "$f"); q=$(command printf '%s' "$v" | command sed -E 's/\$(\{?[A-Za-z_])/\\$\1/g'); k=$(command grep -v '^OPENAI_API_KEY=' "$f"); command printf "%s\nOPENAI_API_KEY='%s'\n" "$k" "$q" > "$f";; esac; unset v q k
```

服务只在启动时读取环境变量、`config.yml` 和 `.env`，无论改的是哪一项，都要重启服务才会生效。`pnpm dev` 在 `config.yml` 或 `.env` 变化时会自动重启，并重新读取这两个文件；但它沿用的是 `pnpm dev` 启动时的环境，拿不到之后新设的系统环境变量。使用系统环境变量方式时，要彻底停掉 `pnpm dev`，再从已经有这个变量的终端重新启动。

:::warning 部署时单独配置

部署环境要在 `dist/` 旁边单独配置自己的 `config.yml`，`pnpm build` 的产物只包含 `dist/` 和 `config.example.yml`，不会带上 `config.yml`。构建会生成一个 `dist/.env`，但里面只有框架自身的白名单键（数据库、邮件、缓存等），不包含 LLM 密钥。使用环境变量方式时，变量要设置在服务管理器启动进程的环境里，例如 systemd 的 `Environment=`、进程管理器的环境配置或容器的环境变量。服务不会读取登录 shell 的 `~/.zshrc`，所以终端里能读到的变量，服务进程里不一定有。首次启动前，请确认这两处都已配置好密钥。

:::

:::tip 为什么 `${OPENAI_API_KEY}` 可以使用

`config.yml` 本身没有通用的环境变量插值语法。`${NAME}` 在这里能生效，是因为 AI 员工插件同步 `ai.llmServices` 和 `ai.mcpServers` 时会递归展开这些值。变量不存在时会得到空字符串，调用通常会在 Provider 认证阶段失败。

:::

## 第三步：在管理页确认模型

打开设置侧栏「AI」分组里的「LLM services」页面（`/settings/ai/llm-services`）。你应该能看到 `gpt` 服务、`OpenAI` Provider 和当前已启用模型。

![编辑 LLM 服务模型](https://static-docs.nocobase.com/20260914111142-ai-employee-llm-services.png)

如果配置里没有写 `enabledModels`，点击模型列前的编辑按钮，从 Provider 返回的模型列表中选择模型；也可以切换到手动输入，填写模型 ID 和显示名称。最后确认服务右侧的「Enabled」开关已经打开。

## 第四步：创建全局 AI 对话入口

开发模式下打开 `/dev/ai-components/floating`，这里展示了全局悬浮入口、右侧面板和对话框之间的组合方式。

![全局悬浮 AI 对话入口](https://static-docs.nocobase.com/20260914111142-ai-components-floating.png)

接下来把下面的任务交给应用里的编码 Agent。让它直接参考当前应用中的示例源码，不要重新实现聊天 Transport。

```text
参考 /dev/ai-components/floating 对应的现有组件和源码，在应用布局中创建一个全局 AI 对话入口。

要求：
- 检查 client/extensions/nocobase-ai；目录不存在时，从当前 AI Employee 插件安装 nocobase-ai Registry 项；
- 用 NocoBaseAIRootProvider 包装 AI UI，并在 client/react-providers.ts 中挂载一次；
- 在页面右下角显示 AIChatFloatingTrigger；
- 点击后用 ChatSurface 打开右侧对话面板，并允许展开为 dialog；
- 复用同一个 AIChatProvider、controller 和 AIChatWindow，切换容器时不要重建会话；
- 用 useAI() 的就绪状态控制渲染：员工或模型还在加载、加载失败、没有可用员工或没有已启用模型时，显示对应的提示，而不是一个看起来可用的输入框；
- 给 AIChatProvider 传入 defaultEmployee，同时给 AIChatFloatingTrigger 传入同一个 aiEmployee（悬浮入口不读取 defaultEmployee），指定入口默认使用的员工，不要依赖排序第一的内置员工；
- 保留历史会话、Tool 审批、附件和断线恢复能力；
- 完成后运行应用的 lint、typecheck、test 和 build。
```

## 第五步：开始对话

刷新应用，点击右下角的 AI 图标。确认默认选中的是你指定的员工和刚才启用的模型，然后发送一条消息。如果员工、模型、流式回答和会话历史都能正常显示，最小链路就已经打通。

遇到问题时按下面的顺序检查：

| 现象                          | 优先检查                                               |
| ----------------------------- | ------------------------------------------------------ |
| 「LLM services」页面没有服务  | `config.yml` 的 YAML 缩进、`ai.llmServices` 和服务重启 |
| 服务存在但没有模型            | 编辑模型列表，或检查 `enabledModels` 中的模型 ID       |
| 调用返回认证错误              | 运行进程是否读到环境变量，Provider 是否与密钥匹配      |
| 看不到可用员工                | 员工是否在「AI Employees」页面启用                     |
| `/dev/ai-components/*` 不存在 | 当前是否为开发模式；Dev Route 不进入生产构建           |

## 相关链接

- [LLM 配置](./configuration/llm.md) — 查看全部 Provider 和配置字段
- [聊天框](./components/chat.md) — 了解聊天窗口的组件层次
- [全局对话入口](./components/floating.md) — 在应用级 Provider 中挂载悬浮入口
- [LLM 服务管理](./management/llm-services.md) — 在后台选择和启用模型
