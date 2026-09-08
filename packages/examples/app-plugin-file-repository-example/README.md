# File Repository 示例

演示如何通过 `@nocobase/app-plugin-file-repository` 的公共接口接入文件 Repository。示例插件拥有业务配置，核心插件只提供通用能力。

| 内容                                                            | 所属插件                             |
| --------------------------------------------------------------- | ------------------------------------ |
| Client／Server Manager、Token、Provider、上传编排、路由定义工具 | `app-plugin-file-repository`         |
| `attachments` 表迁移、具体资源 API、下载入口、页面和翻译        | `app-plugin-file-repository-example` |

在应用中先注册核心插件，再注册示例插件：

```ts
// client/plugins.ts
import fileRepository from '@nocobase/app-plugin-file-repository/client';
import fileRepositoryExample from '@nocobase/app-plugin-file-repository-example/client';
defineClientPlugins([fileRepository(), fileRepositoryExample()]);

// server/plugins.ts
import fileRepository from '@nocobase/app-plugin-file-repository/server';
import fileRepositoryExample from '@nocobase/app-plugin-file-repository-example/server';
defineServerPlugins([fileRepository, fileRepositoryExample]);
```

默认应用已完成上述注册。运行应用 migration 后创建 `attachments` 表，开发页面为 `/dev/file-repository`。页面支持单文件、批量上传、列表、下载和删除记录。

示例 Server 通过 `defineFileRepositoryApiRoutes()` 声明 `attachments`，使用 `main` 数据库连接、`local` 盘、`stream` 模式：

- `POST /api/attachments:<action>`：findMany、findOne、count、exists、deleteOne、uploadOne、uploadMany。
- `GET /uploads/attachments/<uuid>.<ext>`：下载完整文件；无扩展名省略后缀。

内容入口属于根路由，不在 `/api` 下。部署前缀由宿主添加一次，例如 `/main/uploads/attachments/...`。页面直接使用响应中的 `contentUrl`。Client 从核心插件导入 `clientFileRepositoryManagerToken`，调用 `manager.repository('attachments')`。

这套表和路由仅是示例，不是核心插件的默认约定。业务应用可只启用核心插件，使用自己的 collection、disk、accessPath 和 actions。

首版保持已确认范围：未接入路由认证授权；deleteOne 只删元数据；不支持 Range/206 或条件缓存。示例页面仅在开发环境出现，但 Server 示例接口没有开发环境限制。

迁移从尚未发布的核心插件原样移动，保留名称与内容。迁移器按名称和内容校验识别既有执行记录，因此本地已执行的同一迁移不会重复建表，也无需修改附件或迁移历史。
