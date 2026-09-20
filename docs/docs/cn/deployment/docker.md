---
title: 独立部署：Docker
description: 不使用 Hub，将业务应用构建为镜像并持久化运行。
---

# 独立部署：Docker

部署 Hub 容器请阅读[部署 Hub 平台](./hub)。本页使用业务应用的构建产物制作镜像，数据库与持久目录配置见[运行配置](./configuration)。

## 1. 构建镜像

先[构建部署包](./standalone#构建部署包)，将包解压到一个独立镜像构建目录，目录内只有 `dist`、`config.example.yml` 和以下 Dockerfile。不要把真实配置或数据库放入镜像构建上下文。

```dockerfile
FROM node:24.15.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node dist/ /app/dist/
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
CMD ["node", "/app/dist/server/standalone.js"]
```

构建机为 x64、目标为 Linux x64 时执行 `docker build --platform linux/amd64 -t crm:release-001 .`。跨架构构建需要可用的 Buildx/模拟环境；业务包与镜像架构必须一致。运行镜像无需重新安装 dist 依赖。

## 2. 准备运行配置

在服务器创建专用目录，放入 `compose.yml`、目标环境 `config.yml` 和 `storage/`。按[认证与会话密钥](./configuration#配置认证与会话密钥)中的说明配置密钥，但 SQLite 路径改为容器内的 `/app/storage/database.sqlite`。确保运行用户有 storage 写权限；上面官方 Node 镜像的 node 用户通常为 UID/GID 1000，应以选定镜像的 `id` 输出为准。

## 3. 创建 Compose 配置

在部署目录创建 `compose.yml`：

```yaml
services:
  crm:
    image: crm:release-001
    restart: unless-stopped
    init: true
    stop_grace_period: 60s
    ports:
      - '127.0.0.1:13000:13000'
    environment:
      NODE_ENV: production
      APP_CONFIG_FILE: /app/config.yml
      APP_BASE_PATH: /crm
      APP_PUBLIC_ORIGIN: https://apps.example.com
      APP_SERVER_HOST: 0.0.0.0
      APP_SERVER_PORT: '13000'
    volumes:
      - ./config.yml:/app/config.yml:ro
      - ./storage:/app/storage
```

## 4. 启动服务

启动前确认 `config.yml` 已存在且为文件，避免 Docker 将不存在的绑定路径创建为目录。在部署目录执行：

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs --tail=100 crm
```

若镜像在其他机器构建，先通过自己的镜像仓库或 save/load 传到服务器。容器内数据库主机不能用宿主机意义上的 localhost。

## 对外访问与验收

按[HTTPS 与反向代理](./configuration#https-与反向代理)配置对外地址，按[初始化与验收](./standalone#初始化与验收)完成管理员改密、业务验证和重启持久性检查。

## 更新与恢复

使用新的镜像版本或 digest，保留原配置和 storage 挂载。发布前完成备份和迁移兼容性检查，更新 image 后运行 `docker compose up -d`，再次验证实际业务。详见[更新与版本恢复](./standalone#更新与版本恢复)与[备份与灾难恢复](./operations#备份与灾难恢复)。
