# nb3 app

`nb3 app` 用来创建、开发和部署业务 App。

App 是用户实际开发的应用，比如 CRM、客服工作台、数据看板。

## 命令

```text
nb3 app create    创建本地 App 源码
nb3 app dev       本地开发 App
nb3 app info      查看 App 信息
nb3 app config    查看或修改 App 配置
nb3 app destroy   删除本地 App
nb3 app deploy    构建并部署 App 到 Hub
nb3 app pull      从 Hub 拉取已有 App（待实现）
nb3 app list      查看 Hub 中的 App（待实现）
```

标注「待实现」的两条命令会以退出码 3 明确报错。

第一版最常用的是：

```text
nb3 app create
nb3 app dev
nb3 app deploy
```

## 创建 App

```bash
nb3 app create crm
cd crm
```

基于 `@nocobase/app-template-default` 生成一个本地 App 源码目录：

```text
crm/
  .nb3/
  client/
  server/
  package.json
  ...
```

App 源码可以放在任意位置，不需要放在 Hub 目录里。

创建完成后安装依赖并启动：

```bash
cd crm
pnpm install
nb3 app dev
```

模板通过 npm 下载，只会拉取模板这一个包，不会克隆整个仓库。也可以指定其他模板来源：

```bash
nb3 app create crm --template @nocobase/app-template-default@3.1.1
nb3 app create crm --template ./packages/app-template-default
nb3 app create crm --registry https://registry.npmmirror.com
```

`--template` 传本地目录时会用 pnpm 打包，把 `workspace:` 和 `catalog:` 依赖解析成真实版本号，因此生成的项目在仓库之外也能安装。

## 本地开发

```bash
nb3 app dev
```

会用项目自身的包管理器运行它的 `dev` 脚本。包管理器按 `packageManager` 字段和 lockfile 判断，因此不会在已有 lockfile 旁边再生成一个。

可以指定端口和地址：

```bash
nb3 app dev --port 3100
nb3 app dev --host 0.0.0.0
```

在 App 的任意子目录下执行都可以，命令会向上查找 `.nb3/` 定位项目根目录。

如果只是本地开发，到这里就够了，不需要安装 Hub。

## 查看 App 信息

```bash
nb3 app info
nb3 app info --json
```

## 查看和修改配置

```bash
nb3 app config                                # 全部
nb3 app config hub                            # 单个
nb3 app config hub http://localhost:3000      # 修改
```

可修改的键是 `hub` 和 `name`。`template` 和 `templateVersion` 记录 App 的来源，不允许修改。

## 删除本地 App

```bash
nb3 app destroy ./crm
```

会要求输入 App 名称确认。加 `--yes` 可跳过确认，非交互环境下必须显式加。

只能删除 App 根目录，传子目录会被拒绝。

## 部署 App

先在 Hub 的「应用中心」中点击「创建应用」。创建成功后，Hub 会预留 App ID，并显示一次该 App 专用的 deploy token。这个 token 只能上传该 App 的 Release 和提交审批，不能批准上线或操作其他 App。

:::warning 注意

deploy token 只显示一次。关闭创建结果前，请先复制并妥善保管。这里的“一次”只限制展示次数，token 会一直有效，直到管理员轮换它。

:::

本地 App 的 `.nb3/config.json` 中，`name` 必须跟 Hub 中的 App ID 一致。为了避免 token 进入 Shell 历史，使用静默输入，再从 App 目录部署：

```bash
(
  read -r -s NB3_HUB_TOKEN
  export NB3_HUB_TOKEN
  printf '\n'
  nb3 app deploy --hub http://127.0.0.1:13001/hub
  deploy_exit=$?
  unset NB3_HUB_TOKEN
  exit "$deploy_exit"
)
```

`--hub` 接收 Hub 的公开基址，必须包含实际挂载路径，比如 `/hub`。不要填写 App Host 的内部地址，也不要把 App ID 拼在地址后面。

部署命令会依次完成这些操作：

1. 运行当前 App 的 `build` 脚本
2. 校验 `dist/server/embedded.js` 和 App 版本
3. 对 `dist/` 计算确定性的 SHA-256，并生成不可变 Release ID
4. 以 tar + gzip 流式上传 Release
5. 提交发布审批

部署成功只表示 Release 已上传并进入待审批状态。管理员仍需在 Hub 的「版本与发布」中批准；完整性检查和健康检查通过后，Hub 才会切换在线版本。

如果已经有可信的构建产物，可以跳过构建：

```bash
nb3 app deploy --hub http://127.0.0.1:13001/hub --no-build
```

发布前想先检查本地产物，可以使用 `--dry-run`。这个模式会构建并校验 Release，但不会读取 deploy token，也不会访问 Hub：

```bash
nb3 app deploy --hub http://127.0.0.1:13001/hub --dry-run
```

默认 Release ID 是 `<package-version>-<artifact-hash-prefix>`。只有需要外部发布编号时，才显式指定新的 ID：

```bash
nb3 app deploy \
  --hub https://apps.example.com/hub \
  --release-id 2026.08.26-1
```

同一个 Release ID 的内容不可修改。重复上传完全相同的内容是幂等操作；如果内容不同，Hub 会拒绝上传。

常用选项如下：

| 选项                | 用途                                          |
| ------------------- | --------------------------------------------- |
| `--dir <directory>` | 指定 App 目录，默认使用当前目录               |
| `--hub <url>`       | 指定 Hub 的公开基址                           |
| `--token <token>`   | 直接提供 deploy token，默认读 `NB3_HUB_TOKEN` |
| `--release-id <id>` | 指定不可变 Release ID                         |
| `--no-build`        | 跳过构建，使用已有的 `dist/`                  |
| `--dry-run`         | 只构建和校验，不访问 Hub                      |
| `--json`            | 输出单个机器可读的 JSON 结果                  |

如果当前 App 已经记录了 Hub 地址，后续可以省略 `--hub`：

```bash
nb3 app config hub http://127.0.0.1:13001/hub
nb3 app deploy
```

不建议把 token 写入 `.nb3/config.json`、命令脚本或 Git。部署完成后，可以从当前 Shell 中清除它：

```bash
unset NB3_HUB_TOKEN
```

## 拉取已有 App（规划中）

`nb3 app pull` 当前尚未实现，会以退出码 3 明确提示。以下流程暂作为规划示例，当前不能执行：

```bash
nb3 app pull crm ./crm
cd crm
nb3 app dev
```

拉取能力实现后，本地目录会记录对应的 Hub 和 App 信息。

## 和 nb3 hub 的关系

`nb3 app` 不负责启动 Hub。

如果需要本地 Hub，先使用：

```bash
nb3 hub create my-hub
cd my-hub
nb3 hub start
```

然后回到 App 目录部署：

```bash
cd ../crm
nb3 app deploy --hub http://localhost:3000/hub
```
