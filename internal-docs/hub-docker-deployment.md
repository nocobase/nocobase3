---
title: Hub Docker Deployment
description: Hub 以 Docker 镜像交付的方案、关键代码事实、实施步骤与镜像发布策略
---

# Hub Docker Deployment

> 状态：提案。本文描述 Hub 提供 Docker 部署的目标方案和实施顺序，对应代码和 CI 尚未落地。
>
> 文中「代码事实」一节的每条结论都对应具体文件和行，是方案形状的依据；后续实现与之不符时应先更新本文。

Hub 自己要怎么部署，是 Hub 作为产品能不能交付的前提问题。把 Hub 部署到另一个 Hub 会套娃，所以 Hub 必须能自部署，而推荐方式应该是一个镜像起一个容器。

本文只讲 Hub 的 Docker 这条路。App 的镜像化、Kubernetes 组合和 Release 制品模型见 [app-management-architecture.md](./app-management-architecture.md)，跨平台构建的机制见 [server-deployment-build.md](./server-deployment-build.md)。

## 1. 目标

- `docker run` 一条命令起一个可用的 Hub，不需要先准备 config.yml
- 源码部署这条路继续保留（`create-app --template hub` 已经可用），但文档上不作推荐
- 官方镜像和用户自建镜像是两条不同的路，都要覆盖

不在本文范围内：Hub 的多副本与 HA、App 的独立镜像、Kubernetes 部署。

## 2. 现状

底子基本齐了，缺的只有一层壳。

| 已经有的          | 位置                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| 完整部署包        | `pnpm build` 产出 `dist/`（约 95MB），含 `server/ client/ cli/ node_modules/ vendor/`                                |
| dist 自带启动脚本 | `dist/package.json` 的 `start` 为 `node ./server/standalone.js`，另有 `migrate`、`seed`                              |
| 跨平台构建        | `pnpm build --target <platform-arch> --node-version <major>`，native 依赖由 `scripts/utils/retarget-native.mjs` 处理 |
| 构建目标被记录    | `dist/package.json` 的 `nocobase.buildTarget`，含 `platform`、`arch`、`libc`、`nodeAbi`、`nodeMajor`                 |
| 部署归档          | `pnpm build --tar` 产出 `storage/dist.tar.gz`，内容是 `config.example.yml` + `dist/`，即用户上传给 Hub 的制品        |
| 进程管理          | `ecosystem.config.js`（pm2）                                                                                         |

缺的：

- 全仓没有任何应用的 Dockerfile。现有的 `docker-compose.yml` 都是跑测试数据库用的
- 没有镜像发布流程，`release-beta.yml` 和 `release-stable.yml` 只发 npm 包
- 没有 artifact 的平台兼容性校验（见第 7 节）

## 3. 决定方案形状的代码事实

### 3.1 Hub 有自己的数据库，只装了 sqlite 驱动

`server/config/database.ts` 的默认连接是 sqlite，文件在 `storage/database.sqlite`，`schemaManagement: 'managed'`，migrations 与 seeds 都 autoRun。

更关键的是 `drivers: { sqlite }` 那一行，注释写明「a connection may only use a dialect listed here」。**Hub 镜像就是 sqlite + 一个卷，compose 里不需要数据库服务。** 想让 Hub 跑 PostgreSQL 属于改模板加驱动，不是改 compose。

### 3.2 config.yml 是可选的

`server/config.ts:22`：

```ts
config.loadFile(configPath, { optional: configuredPath === undefined });
```

没有显式指定配置路径时，配置文件缺失不报错。**容器可以只靠 TypeScript 默认值加环境变量启动**，不必强制挂配置文件。

### 3.3 环境变量的面很小

`server/environment.ts` 一共映射了 8 个键：

```
AUTH_SECRET          -> auth.secret
SESSION_SECRET       -> session.secret
APP_SERVER_HOST      -> server.host
APP_SERVER_PORT      -> server.port
APP_PUBLIC_ORIGIN    -> app.publicOrigin
APP_DEFAULT_LOCALE   -> i18n.defaultLocale
SNOWFLAKE_WORKER_ID  -> snowflake.workerId
APP_VITE_DEV_URL     -> spa.viteDevUrl
```

其中只有 `AUTH_SECRET` 没有默认值，是唯一必须提供的。

注意不要被 `scripts/build.mjs` 里那份 `serverEnvKeys` 误导：那张表里的 `DB_*`、`SMTP_*`、`REDIS_*` 只是决定哪些变量会被转写进 `dist/.env`，Hub 这边没有对应的 mapping，对 Hub 不生效。

默认监听是 `server/config/server.ts` 的 `127.0.0.1:13000`，**容器里必须把 host 改成 `0.0.0.0`**，否则端口映射出去连不上。

### 3.4 Hub 会 spawn 一个 Host 子进程

`app-plugin-hub/server/providers/hub.ts` 用 `AppHostSupervisor.initialize({ ...config.host, mode: 'managed' })`，而 `app-host/src/supervisor.ts:381` 是真的 `spawn`：默认 driver 为 `node`（`server/config/hub.ts` 里生产环境走 `node`，开发走 `tsx`），命令是 `process.execPath`，参数是编译后的 app-host 入口，`stdio` 带 `ipc`。

所以容器内的进程结构是：

```text
PID 1  Hub (node server/standalone.js)
  └─ spawn  App Host (node .../app-host/...)
       ├─ App A  in-process
       ├─ App B  in-process
       └─ App C  in-process
```

结论有两条：

- **一个镜像就够，不需要 docker-in-docker，Hub 也不需要访问宿主机的 docker socket。** 这省掉了最麻烦的一块
- **但容器是多进程的**，PID 1 要能回收子进程并正确传递信号，所以要 `--init`（compose 里 `init: true`），或者在镜像里放 tini

`AppHostSupervisor.shutdown()` 已经处理了 SIGINT / SIGTERM，优雅退出这一侧不用额外做。

app-host 已经随构建进了 `dist/vendor/@nocobase/app-host`，镜像不需要额外装。

### 3.5 storage 目录在 dist 里面

`server/standalone.ts:13` 是 `rootDir: path.resolve(import.meta.dirname, '..')`，对 `dist/server/standalone.js` 来说 rootDir 就是 `dist/`；而 `app-server/src/config/paths.ts` 里 storage 默认是 `<rootDir>/storage`。

所以部署形态下：

```text
/app/config.yml          ← 可选，配置文件查找 dist 及其父目录
/app/dist/               ← 镜像内容
/app/dist/storage/       ← 数据，必须挂卷
    database.sqlite        Hub 自己的库
    app-artifacts/         上传的 dist.tar.gz
    app-deployments/       解出来的应用
    app-volumes/           各托管应用的数据
    hub/host-config.yml    Host 的配置
```

**这里有个值得改的地方**：`dist` 是镜像内容，`storage` 是数据，混在一起不干净——升级镜像时卷必须挂进一个本该只读的目录。`createConfigPaths` 本身支持 `storageDir` 选项，但 `standalone.ts` 没有传。建议加一个 `APP_STORAGE_DIR` 环境变量映射，让容器可以把数据放在 `/app/storage`。这件事不阻塞第一版镜像，但越早做越好。

**卷里装的是所有托管应用的数据**，丢了不是 Hub 挂掉那么简单，文档里要写死。

## 4. 三个必须先定的决策

### 4.1 在镜像里构建，而不是构建好再 COPY

建议采用多阶段构建，builder 阶段就在 linux 里跑 `pnpm build`。这样 `--target` 完全不用操心，native 依赖天然正确。

备选方案是 CI 里先 `pnpm build --target linux-x64 --node-version 24` 再 COPY `dist/`，构建快，但要求每次都记得带 `--target`，忘了就产出一个只在服务器上崩的镜像。正确性优先。

### 4.2 基础镜像必须是 glibc

用 `node:24-bookworm-slim`，不要 alpine。

这不是体积取舍而是正确性：`buildTarget` 里记着 `libc`，用户在 macOS 或 Linux 上构建出来的 `.node` 是 glibc 的，alpine 是 musl，直接加载不了。Hub 要托管用户上传的应用，基础镜像的 libc 就是所有托管应用的隐含契约。

Node 版本跟 `engines` 保持一致（`>=24.0.0`）。

### 4.3 官方镜像和模板镜像是两份文件

| 场景         | 文件                                             | build context                              |
| ------------ | ------------------------------------------------ | ------------------------------------------ |
| 官方镜像     | `docker/hub.Dockerfile`                          | 仓库根，需要 workspace 才能 `pnpm install` |
| 用户源码部署 | `packages/templates/app-template-hub/Dockerfile` | 生成出来的独立应用目录                     |

两者构建方式不同，不能共用一份。

**连带问题**：Hub 和 App 首先都是应用，应用本身都应该能自部署。按 AGENTS.md 的模板同步规则，模板里加 Dockerfile 属于框架层改动，默认应该 `app-template-default`、`app-template-examples`、`app-template-hub` 三个模板都加。这一条需要单独确认，确认后放在独立的 PR 里做。

## 5. 实施步骤

### 第 0 步：先手工验证一遍

不要跳过。先确认一个 linux 容器能不能跑起现有的 dist：

```bash
pnpm --filter @nocobase/app-template-hub build

docker run --rm -it -p 13000:13000 --init \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e APP_SERVER_HOST=0.0.0.0 \
  -v "$PWD/packages/templates/app-template-hub/dist:/app/dist" \
  -w /app/dist \
  node:24-bookworm-slim node server/standalone.js
```

在 macOS 上构建出来的 dist，这一步大概率会因为 native 依赖加载失败。**这正是要先看到的现象**，它验证了 4.1 和 4.2 的判断。看到之后再换成 `--target linux-x64` 重构建确认能起来，然后才开始写 Dockerfile。

同时要确认的：访问 `http://localhost:13000/hub` 能打开（`APP_BASE_PATH` 默认 `/hub`），Host 子进程能正常 spawn 起来。

### 第 1 步：docker/hub.Dockerfile

多阶段：

- **builder**：`node:24-bookworm-slim`，`corepack enable`，COPY workspace，`pnpm install --frozen-lockfile`，`pnpm --filter @nocobase/app-template-hub build`
- **runtime**：`node:24-bookworm-slim`，`COPY --from=builder .../dist /app/dist`，`WORKDIR /app/dist`，`EXPOSE 13000`，`ENTRYPOINT ["/docker-entrypoint.sh"]`，`CMD ["node","server/standalone.js"]`

配套必须写 `.dockerignore`，排掉 `node_modules`、`dist`、`storage`、`.git`。不写的话 95MB 的 dist 加上全仓 node_modules 会把构建上下文撑爆。

`APP_SERVER_HOST` 在镜像里默认设成 `0.0.0.0`。

### 第 2 步：docker-entrypoint.sh

`AUTH_SECRET` 是唯一必填项，但要求用户第一次就知道要生成它，体验不好。entrypoint 做首次自举：

1. 用户显式传了 `AUTH_SECRET` 就用用户的
2. 否则看卷上有没有 `storage/.auth-secret`，有就读
3. 都没有就 `openssl rand -hex 32` 生成一个写进卷

`SESSION_SECRET` 同理。这样下面这条命令就能直接起来：

```bash
docker run -d --init -p 13000:13000 -v hub-storage:/app/dist/storage <image>
```

和 NocoBase 2 的开箱体验对齐。

### 第 3 步：docker-compose.yml

一个 service 加一个 named volume 就够了，因为只有 sqlite。`init: true` 不能漏（见 3.4）。同时给一份挂本地目录的注释版本，方便用户备份。

### 第 4 步：补 buildTarget 校验

见第 7 节。建议和 Dockerfile 同一批做，但拆成独立 PR。

### 第 5 步：CI 发布镜像

在 `release-beta.yml` 和 `release-stable.yml` 里加 job，用 buildx 出 `linux/amd64` 和 `linux/arm64`。

注意 arm64 这一侧：QEMU 模拟下编译 native 依赖非常慢，能拿到 arm runner 就用 arm runner。

### 第 6 步：文档

`packages/templates/app-template-hub/README.MD` 现在有「Deploying to a different machine」一节，Docker 一节加在它旁边，同时写明「源码部署可以但不推荐」。

## 6. 镜像发到哪里

### 6.1 现有线索

- npm 包发的是自建源 `https://npm.nocobase.ai`（`release-beta.yml:66`、`release-stable.yml:80`），不是公开 npmjs
- 阿里云 ACR 的 `registry.cn-shanghai.aliyuncs.com/nocobase/` 这个 namespace 已经在用（kingbase 镜像）
- GitHub 仓库 `nocobase/nocobase3` 是公开的
- 两个 release workflow 的 `permissions` 目前只有 `contents: write` 和 `pull-requests: write`

### 6.2 三个候选

| 位置                                                        | 优点                                                                                                     | 代价                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| Docker Hub `nocobase/hub`                                   | 用户最习惯，`docker run nocobase/hub` 不用配 registry，与 v2 认知一致                                    | 免费版有拉取限流，国内慢  |
| ghcr.io `ghcr.io/nocobase/hub`                              | 仓库就在该组织下，加 `packages: write` 配 `GITHUB_TOKEN` 就能推，不需要额外账号和 secret；可先私有后公开 | 国内更慢，用户认知度低    |
| 阿里云 ACR `registry.cn-shanghai.aliyuncs.com/nocobase/hub` | namespace 现成，国内拉取快                                                                               | 需要 AK/SK secret，海外慢 |

### 6.3 建议

**先推 ghcr，而且先私有。**

npm 包现在还发在自建源上，说明 v3 尚未进入公开分发阶段。镜像应与之保持一致，避免出现「包还没公开、镜像先公开了」的错位。ghcr 的好处正在这里：零额外成本起步，公开与否只是一个开关。

等 v3 正式对外时，再加 Docker Hub 作主渠道、阿里云 ACR 作国内镜像，三个一起推。buildx 一次构建推三个 registry，只是多两条 login，不是重做。

### 6.4 命名与 tag

镜像名公开之后基本是长期契约，而且 App 后续大概率也要出镜像，建议一次规划完：

```text
nocobase/hub:<version>      Hub
nocobase/app:<version>      将来 App 的基础镜像
```

要与 v2 的 `nocobase/nocobase` 明确区分，避免用户拉错。

tag 策略：

```text
nocobase/hub:1.0.0-beta.12   精确版本，永不覆盖
nocobase/hub:beta            跟随 release-beta
nocobase/hub:latest          只有 release-stable 才移动
```

当前版本是 `1.0.0-beta.12`，走的是 beta 线，**所以第一版只推精确版本和 `:beta`，`:latest` 先不要占**，等 stable 出来再给。

## 7. 必须一起补的：artifact 平台校验

`@nocobase/app-host` 和 `app-plugin-hub/server` 里目前**没有任何 `buildTarget` 校验**。

现在 Hub 和用户大多在同一台机器上，碰不到这个问题。**一旦 Hub 变成 linux 容器，用户在 macOS 上 `pnpm build --tar` 出来的包上传后，native 依赖会直接加载失败，而且报错完全不指向真正原因**（典型如 `Could not locate the bindings file`）。

做法：上传或部署 artifact 时，读取其 `dist/package.json` 的 `nocobase.buildTarget`，与 Hub 自身的 `process.platform`、`process.arch`、libc、`process.versions.modules` 比对，不匹配即拒绝，并把应当使用的命令直接写进错误信息：

```text
This artifact was built for darwin-arm64 (Node ABI 137).
This Hub runs linux-x64 (Node ABI 137). Rebuild with:

  pnpm build --tar --target linux-x64 --node-version 24
```

这一步不做，Docker 化之后它会成为头号用户报错。

## 8. 开放问题

- `app-template-default` 和 `app-template-examples` 是否同步提供 Dockerfile（见 4.3）
- Hub 是否需要支持 sqlite 以外的数据库；若需要，是在模板里加驱动还是提供另一个镜像变体（见 3.1）
- 是否引入 `APP_STORAGE_DIR`，把数据目录从 `dist/` 里挪出来（见 3.5）
- arm64 镜像的构建方式：QEMU 还是 arm runner
- v3 公开发布的节奏，决定镜像何时从私有转公开（见 6.3）

## 9. PR 拆分

| PR  | 内容                                                                                                              | 说明                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | `docker/hub.Dockerfile`、`docker-entrypoint.sh`、`docker-compose.yml`、`.dockerignore`、Hub README 的 Docker 一节 | 只做 Hub，只做官方镜像这条路                                              |
| 2   | artifact 的 `buildTarget` 校验                                                                                    | 独立、可测，价值单独成立                                                  |
| 3   | 三个模板各自的 Dockerfile                                                                                         | 一牵扯模板就要三个模板同步改并各自跑 `check`，与前两个混在一起难以 review |
| 4   | CI 镜像发布 job                                                                                                   | 依赖 6.3 的决策先定                                                       |

第 0 步的手工验证结果可能会改变 PR 1 的内容，所以先验证再拆。
