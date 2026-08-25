# nb3 app

`nb3 app` 用来创建、开发和部署业务 App。

App 是用户实际开发的应用，比如 CRM、客服工作台、数据看板。

## 命令

```text
nb3 app create    创建本地 App 源码
nb3 app dev       本地开发 App
nb3 app build     构建生产产物
nb3 app start     以生产模式运行已构建的产物
nb3 app info      查看 App 信息
nb3 app config    查看或修改 App 配置
nb3 app destroy   删除本地 App
nb3 app deploy    部署 App 到 Hub（待实现）
nb3 app pull      从 Hub 拉取已有 App（待实现）
nb3 app list      查看 Hub 中的 App（待实现）
```

标注「待实现」的三条命令需要 Hub 提供 App 管理 API，目前 Hub 还没有这部分能力，执行会以退出码 3 明确报错。

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

## 构建和运行生产产物

```bash
nb3 app build
nb3 app start
```

`build` 运行 App 的 `build` 脚本，产物写到 `dist/`；`start` 运行 `start` 脚本，直接伺服这份产物。和 `dev` 不同，`start` 不会编译源码，没有先 build 就 start 会报错。

`start` 同样支持指定端口和地址：

```bash
nb3 app start --port 3100
nb3 app start --host 0.0.0.0
```

`--port` 和 `--host` 通过环境变量传给脚本，而不是拼在命令行上——`pnpm run start -- --port 3100` 会把 `--` 原样交给脚本，npm 和 yarn 却会吞掉它，靠命令行转发在三个包管理器之间行为并不一致。CLI 会同时设置 `APP_SERVER_HOST`/`APP_SERVER_PORT` 和 `HOST`/`PORT`：默认模板读前者，Vite 系模板读后者。

三条命令都接受 `--dir` 指定 App 目录：

```bash
nb3 app build --dir ./crm
```

App 脚本的退出码会原样返回，构建失败时 `nb3 app build` 就是失败，可以直接用在 CI 里。

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

部署需要一个目标 Hub。

部署到本地 Hub：

```bash
nb3 app deploy --hub http://localhost:3000
```

部署到远端 Hub：

```bash
nb3 app deploy --hub https://apps.example.com
```

如果当前 App 已经记录了 Hub 地址，后续可以直接执行：

```bash
nb3 app deploy
```

## 拉取已有 App

如果 Hub 中已经有 App，可以拉取到本地开发：

```bash
nb3 app pull crm ./crm
cd crm
nb3 app dev
```

拉取后，本地目录会记录对应的 Hub 和 App 信息。

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
nb3 app deploy --hub http://localhost:3000
```
