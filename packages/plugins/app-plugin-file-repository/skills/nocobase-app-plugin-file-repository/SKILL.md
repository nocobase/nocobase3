---
name: nocobase-app-plugin-file-repository
description: 在 NocoBase 3 App 中接入文件 collection，声明文件 API 和统一访问地址，通过 Server Service、Client Service 或 React useService 查询、上传和下载附件。适用于 app-plugin-file-repository，不用于旧 app-plugin-file 或存储凭证配置。
---

# 为 App 接入文件 Repository

使用 `@nocobase/app-plugin-file-repository` 的公开 `./server`、`./client` 导出。核心插件提供 Manager、Token、ServiceProvider 和路由工具；App 或业务插件拥有 collection 迁移、Drive 配置、具体资源路由和页面。

## 准备已有应用

先查看目标 App 的插件注册、数据库迁移、disk 和资源路由，沿用已有命名。以下 `attachments`、`main`、`local` 是示例，可按实际配置替换。

- Server 插件列表注册 `./server` 默认导出；Client 列表注册 `./client` 默认导出工厂的调用结果。核心插件排在使用它的业务插件之前。
- 核心插件不会自动建表或开放文件资源。按任务需要在 App 或业务插件中添加自包含迁移及路由。
- 独立的 `@nocobase/app-plugin-file-repository-example` 已拥有 `attachments` 迁移、资源路由和 `/dev/file-repository` 页面。启用它时不要重复注册这些资源。
- `FileRecord.size` returns an exact string for a `bigInt` column and a number for an `integer` column. Keep the string intact for transport and display.
- 文件 collection 必须具备固定字段，无映射：`id` 为 UUID 兼容的唯一主键字段；`disk`、`key`、`filename`、`ext`、`mimeType` 为 string/char/text；`size` 为 integer/bigInt；`createdAt`、`updatedAt` 为 datetime/datetimeTz。字符串主键须容纳 36 字符。
- 上传由服务端生成 UUID/key、规范化文件名与扩展名、读取实际存储大小并写时间。额外业务必填字段需要默认值，上传不接收 `values`。`contentUrl` 为响应字段，不建列。

## 声明服务端文件 API

在业务的 Server routes 模块声明，并把返回数组合并到 App routes，或传入业务插件的 `defineServerPlugin({ packageName, routes })`，保留已有贡献。

```ts
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file-repository/server';

export default defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: 'attachments',
      collection: 'attachments',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/attachments',
      accessMode: 'stream',
      actions: {
        findMany: {},
        findOne: {},
        deleteOne: {},
        uploadOne: { maxSize: 5 * 1024 * 1024 },
        uploadMany: { maxSize: 20 * 1024 * 1024 },
      },
    },
  ],
});
```

`name` 是 Client 资源名，`collection` 默认同 name，`connection` 默认数据库连接；`disk` 必填。`accessPath` 默认 `/uploads/<name>`，以 `/` 开头、无尾斜杠，静态路径段只用字母数字、下划线、连字符。`accessMode` 默认 stream。

只开放声明的 POST `/api/<name>:<action>`。普通 action 支持 `findMany/findOne/count/exists/aggregate/groupBy/createOne/updateOne/deleteOne`，另有 `uploadOne/uploadMany`。不提供 `createMany/updateMany/deleteMany` HTTP action。普通 CRUD 复用现有 Repository 协议；createOne/updateOne 默认禁止写入，需要业务配置服务端 writePolicy 白名单。上传不依赖开放 createOne。

内容路由是 GET `<accessPath>/<uuid>.<ext>`，无扩展名省略点号；不在 `/api` 下，也不要求开放 findOne。stream 输出完整文件下载；redirect 返回 302，公开对象使用存储 URL，私有对象使用 5 分钟签名 URL。磁盘不支持生成 URL 时选择 stream，不假设自动回退。

## 在服务端 Service 中操作文件

从当前 Server 应用的 `app.container` 解析，ServiceProvider 内使用 `this.app.container`；在相关服务已注册后调用。

```ts
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file-repository/server';

const manager = container.resolve(serverFileRepositoryManagerToken);
const attachments = manager.repository('attachments', {
  connection: 'main',
  disk: 'local',
  accessPath: '/uploads/attachments',
});
const { record } = await attachments.uploadOne({ file });
const url = attachments.getUrl(record);
```

Server 的 repository 参数是 collection 名；disk、accessPath 必填，与访问路由配置保持一致。`getUrl(record)` 同步生成应用内路径；`await attachments.getStorageUrl(record)` 使用记录的 disk/key 生成真实公开或签名 URL。两个方法不查询数据库，后者要求磁盘具备对应 URL 能力。

Server 上传结果带应用内 contentUrl；直接调用普通 CRUD 不自动附加该字段，需要时用 getUrl。Server 仍保留本地数据库 Repository 方法。

## 在普通 Client 模块中调用

从当前 Client 应用容器解析；ServiceProvider 使用 `this.app.container`。Manager 已复用 apiClientToken，不再创建 API Client 或上传 HTTP 封装。

```ts
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file-repository/client';

const manager = container.resolve(clientFileRepositoryManagerToken);
const attachments = manager.repository('attachments');
const records = await attachments.findMany({ limit: 20 });
const { record } = await attachments.uploadOne({ file });
const batch = await attachments.uploadMany({ files });
```

Client 参数是 Server 声明的资源 name，不传 connection/disk/accessPath。普通操作委托 api.repository()，上传委托 api.request()。

两端共同方法的参数结构一致：file 为原生 File，files 为非空 File 数组。单传返回 `{ record, createdTargets, version? }`，多传返回 `{ createdCount, records }`。Client 解包 HTTP `{ data }`；上传已包含创建记录，不再调用 create。

下载使用 `record.contentUrl`，不要自行拼 `/api`。宿主 publicBasePath 已由 HTTP 层添加，例如 `/main/uploads/attachments/...`。HTTP 查询自定义 select 时同时选 id、ext 才有 contentUrl；Client 不提供 Server 的两个 URL 方法。

## 在 React 中调用

组件须处于已启动 App 的 React 上下文内，使用已有 useService，在事件或数据加载逻辑中发请求。

```tsx
import { useMemo } from 'react';
import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file-repository/client';

// 放在组件或自定义 Hook 内。
const manager = useService(clientFileRepositoryManagerToken);
const attachments = useMemo(() => manager.repository('attachments'), [manager]);
```

上传事件取 `input.files`；多传用 `Array.from(input.files)`。页面处理加载、错误、成功状态，防止重复提交，并用返回的 contentUrl 显示下载链接。沿用 App 的样式和 i18n；无需新增文件专用 Hook。

## 验证与诊断

验证实际闭环：上传 → 查询记录 → 获取 contentUrl → 下载字节与原文件一致。批量检查 createdCount 和 records；配置资源别名或宿主前缀时也验证实际地址。

上传使用 multipart 的 `file` 字段，多传重复同名字段；Client 自动处理 boundary。默认上限单传 5 MiB、多传 20 MiB，均为整个 HTTP 请求体含表单开销，直接调用 Server Service 不受该 HTTP 限制。超限应为 413 `BODY_TOO_LARGE`，无有效 File 为 400；零字节文件允许上传。

缺少 schema 字段报 `INVALID_FILE_COLLECTION`，在写存储前失败。`STORAGE_URL_UNAVAILABLE` 检查盘的 URL 能力。遇到 `FILE_COMMIT_UNCERTAIN` 或 `FILE_CLEANUP_FAILED`，核对本次数据库记录与存储对象再决定重试或清理，避免盲目重试造成重复记录或误删。

当前没有路由认证、资源授权或行级 ACL，writePolicy 不是用户权限；不要将应用登录页当作文件路由的保护。stream 不支持 Range/206、ETag 或条件请求；deleteOne 仅删元数据；没有自动物理删除、孤儿对账、断点上传、幂等重试、内容嗅探或恶意文件检测。按任务实际需要处理这些限制，不将未实现能力描述为已可用。
