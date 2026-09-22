# UI Library 部署

UI Library 的 GitHub Actions workflow 会构建 `ui-library/dist`，并在 `develop` 分支更新后自动上传到阿里云 OSS Bucket `nocobase-ui-library` 的根目录，线上地址为 [http://ui.nocobase.com](http://ui.nocobase.com)。

发布需要四个参数，对应 GitHub 仓库 **Settings → Secrets and variables → Actions** 里的 Repository secret：`DOCS_ALI_OSS_ACCESS_KEY_ID` 和 `DOCS_ALI_OSS_ACCESS_KEY_SECRET` 是文档站已在使用的阿里云 RAM AccessKey，可以直接复用；`UI_LIBRARY_BUCKET` 填 `nocobase-ui-library`，`UI_LIBRARY_REGION` 填 `cn-beijing` 或 `oss-cn-beijing`，workflow 会自行去掉 `oss-` 前缀。Secret 只在发布步骤使用，不要写入仓库文件或普通变量。

这个 RAM 用户原本是给文档 Bucket 用的，需要确认它的授权范围也覆盖 `nocobase-ui-library`（至少 `oss:PutObject`，`ossutil cp` 在部分场景下还会用到 `oss:GetObject`）。如果只授权了文档 Bucket，发布会以 `AccessDenied` 失败。

Pull Request 会安装依赖、构建并检查产物，但不会上传 OSS。合并到 `develop` 后会自动发布；也可以在 **Actions → UI Library → Run workflow** 手动运行。手动运行时勾选发布只会在选择的 ref 是 `develop` 时上传，其他分支只执行构建检查。

发布使用固定版本的 `ossutil`，Bucket 和地域来自上面的 secret，上传目标是 `oss://<bucket>/` 根目录。资源、Registry 条目、Registry 索引和 `index.html` 按顺序上传；入口 HTML 和 Registry 索引使用 `Cache-Control: no-cache`，Vite 生成的内容哈希文件使用一年期不可变缓存，`favicon.svg` 和 `assets/` 下从 `public/` 复制来的固定名称图片使用一天缓存。Workflow 不会删除 OSS 中已有的对象，因此上传中断时旧文件仍会保留。

如果发布失败，先查看 Actions 日志中第一个失败的步骤：构建失败通常是依赖或 TypeScript/Vite 问题，验证失败表示预期的 `dist` 文件缺失，OSS 步骤失败通常是 Secret 无效、RAM 用户没有目标 Bucket 的 `oss:PutObject` 权限或 Bucket 地域不匹配。发布成功后可检查首页、`http://ui.nocobase.com/r/registry.json` 以及它 `items` 里列出的条目文件（例如 `http://ui.nocobase.com/r/auth-ui.json`）是否返回 JSON；若看到 HTML，说明静态网站回退规则拦截了该路径，需要检查 OSS 对象是否位于 Bucket 根目录。
