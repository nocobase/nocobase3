---
title: '邮件插件功能清单'
description: '查看 NocoBase v3 邮件插件已经实现的能力、Provider 差异，以及参考 v2 邮件管理插件整理的后续功能。'
keywords: 'NocoBase,邮件,邮箱,Gmail,Microsoft 365,Outlook,功能清单'
---

# 邮件插件功能清单

NocoBase v3 的**邮件插件（Mail）**负责连接用户自己的邮箱账户，在 NocoBase 中同步、查看、管理和发送邮件。它和通知插件的职责不同——通知插件负责应用通知投递，邮件插件负责完整的用户邮箱体验。

这份清单覆盖 `@nocobase/app-plugin-mail`，包括邮件核心及内置的 Gmail、Microsoft 365 和 IMAP/SMTP 适配模块。应用只需注册 Mail 插件。

状态说明：

- `[x]`——当前 v3 已实现
- `[ ]`——当前 v3 尚未实现
- **部分实现**——底层能力已经具备，不过还没有完整的产品界面或 NocoBase 配置能力

## v3 明确不规划的范围

以下能力不计入 v3 邮件插件的待办清单：

- JMAP 和 POP3 Provider
- 在设置界面管理 Provider Client ID、Client Secret 等部署配置
- 跨账户统一收件箱和跨账户全局搜索
- 邮件规则、自动分类、垃圾邮件和钓鱼邮件举报
- 管理员共享模板，以及模板分类、搜索和排序
- FlowEngine 邮件消息、详情和发送区块
- 从表格选中记录或全部记录批量发送
- AI 员工总结、分析、翻译和辅助写信

## 当前 v3 已实现的功能

### 1. 邮件 Provider 与账户接入

- [x] Gmail Provider
  - [x] Google OAuth 2.0 授权
  - [x] Authorization Code + PKCE
  - [x] OAuth 回调地址支持 `mail.oauthCallbackUrl` / `MAIL_OAUTH_CALLBACK_URL`，默认使用应用公共地址与 `/mail/oauth/callback`
  - [x] Gmail API 收信、发信与增量同步
  - [x] Gmail label、thread、draft 和 send-as identity 适配
  - [x] Gmail Pub/Sub push 通知
- [x] Microsoft 365 Provider
  - [x] Microsoft identity OAuth 2.0 授权
  - [x] Authorization Code + PKCE
  - [x] OAuth 回调地址支持 `mail.oauthCallbackUrl` / `MAIL_OAUTH_CALLBACK_URL`，默认使用应用公共地址与 `/mail/oauth/callback`
  - [x] Microsoft Graph 收信、发信与增量同步
  - [x] Microsoft folder、conversation、draft 和 identity 适配
  - [x] Microsoft Graph change notification
- [x] 通用 IMAP / SMTP Provider（MVP）
  - [x] 配置独立的 IMAP 与 SMTP endpoint、TLS 和常用文件夹名称
  - [x] 用户输入邮箱地址、用户名和密码，连接时同时验证 IMAP 与 SMTP
  - [x] 通过 IMAP 发现文件夹并导入邮件
  - [x] 使用 IMAP UIDVALIDITY 与 UIDNEXT 执行可恢复的定时增量同步
  - [x] 通过 SMTP 发送纯文本、HTML、回复和附件
  - [x] 标记已读、星标、附件下载和服务端永久删除
  - [ ] Push、Provider 原生 label、远端草稿、别名和移动到文件夹
  - [ ] 外部旗标、删除和移动的完整变化对账
- [x] 一个 NocoBase 用户连接多个邮箱账户
- [x] 同一邮箱账户只能归属于一个 NocoBase 用户
- [x] 邮件工作区默认展示当前用户所有账户的邮件，并标识邮件来源账户
- [x] 写信时从浏览器缓存恢复上次选中的发件账户
- [x] 停用和启用邮箱账户
- [x] 移除邮箱账户并清理本地同步数据和凭据（不删除服务商邮箱邮件）
- [x] 展示账户授权状态
  - [x] 正常
  - [x] 已停用
  - [x] 需要重新授权
  - [x] 已撤销
  - [x] 正在移除
- [x] Provider 配置支持多个命名实例——比如公司 Gmail 和测试 Gmail
- [x] 开发账户工作区默认展示已接入账户表
- [x] 从账户工作区按钮打开关联账户流程
- [x] 在关联账户抽屉内设置首次同步日期
- [x] 从账户行打开签名管理抽屉并管理账户级签名
- [x] 在账户工作区打开私有邮件模板和 NocoBase 本地标签管理（含颜色）
- [x] 已注册但未配置 `mail.providers` 的 IMAP/SMTP 类型可见，并提示先完成服务端配置
- [x] 工作台和批量发件页使用本地发件地址选择，列出账号主地址和可发送别名

### 2. 凭据与授权安全

- [x] OAuth state 短时有效并且只能使用一次
- [x] OAuth PKCE verifier 只保存在服务端
- [x] OAuth credential 默认以明文 JSON 保存在服务端数据库中，可由独立插件替换凭据仓库
- [x] 支持 refresh token 轮换
- [x] API 返回值隐藏 credential reference、authorization subject 和同步 cursor
- [x] 公共 OAuth callback 只处理已经创建的授权事务
- [x] 账户、邮件、附件、草稿、模板和身份操作均校验当前用户所有权
- [x] 个人 Mail API 检查 `mail.workspace/access`，跨用户账号和操作日志 API 检查 `mail.admin/access`，邮件管理页及批量操作 API 独立检查 `mail.management/access`

### 3. 邮箱同步

- [x] 首次全量同步
  - [x] 按起始日期限制同步范围
  - [x] 设置最大消息数：默认 10,000 封，API 的 `maxMessages` 可调整为 1–100,000
  - [x] 起始日期和最大消息数同时生效，以先达到数量上限或没有更多符合日期条件的邮件为准
  - [x] 服务端配置每批消息数
  - [x] 默认每批同步 100 封邮件（`mail.syncBatchSize` / `MAIL_SYNC_BATCH_SIZE`，范围 1–200）
  - [x] 大邮箱分批执行，可中断后继续
- [x] 增量同步
  - [x] Gmail History 增量同步
  - [x] Microsoft Graph 按文件夹 delta 同步
  - [x] IMAP 按 UIDVALIDITY / UIDNEXT 发现新邮件
  - [x] Gmail History 暂时不可用时按时间扫描恢复
  - [x] 同步 Provider 返回的邮件新增、更新、文件夹移除和删除状态
- [x] 文件夹和 label 发现
  - [x] 分页发现大规模文件夹层级
  - [x] 新增和移除文件夹的 reconciliation
  - [x] 同步 Inbox、Sent、Drafts、Trash、Junk、Archive 和自定义目录
- [x] 手动同步，默认同步当前用户所有支持增量同步的活动账户，也可切换为单账户同步
- [x] 自动轮询同步
  - [x] 默认每 5 分钟执行一次
  - [x] 通过 `MAIL_AUTOMATIC_SYNC_INTERVAL_MS` 调整间隔
- [x] Push 通知触发增量同步
  - [x] Gmail watch 自动创建和续订
  - [x] Microsoft Graph subscription 自动创建、续订和删除
  - [x] 重复通知合并到同一条增量同步链路
  - [x] Push 丢失时继续使用定时轮询兜底
- [x] 查看同步进度和同步结果
- [x] 保证同一账户同时只有一个有效同步任务
- [x] 通过 config 统一配置所有账户的自动同步间隔，并按账户上次同步时间判断是否到期

### 4. 邮件中心与浏览

- [x] 开发邮件中心页面 `/dev/mail/center`
- [x] 在多个已连接账户之间切换
- [x] 按 Provider 文件夹或 NocoBase 本地标签查看邮件
- [x] 全部账号或单个账号没有 Provider 文件夹时仍显示收件箱、已发送、草稿箱、垃圾箱、垃圾邮件和归档默认文件夹
- [x] 当前账号自定义文件夹显示在默认文件夹之后，文件夹筛选可以和本地标签筛选同时生效
- [x] 智能视图
  - [x] 全部邮件
  - [x] 未读邮件
  - [x] 已加星标邮件
- [x] 按关键词搜索主题、摘要、发件人显示名称/地址和收件人显示名称/地址，不匹配正文
- [x] 邮件列表分页加载
- [x] 展示发件人、主题、摘要、时间、未读、星标和附件状态
- [x] 查看邮件正文
- [x] 下载收到的附件
- [x] 使用 Provider 原生 thread / conversation 展示会话
- [x] 同一会话中的多封邮件支持逐封折叠和展开，折叠时保留摘要
- [x] 会话较长时向前分页加载
- [x] 没有稳定 conversation ID 的邮件按单封邮件展示
- [x] HTML 邮件降级为纯文本展示，避免直接渲染不可信 HTML
- [x] Trash 邮件支持永久删除，执行前需要二次确认
- [ ] 正文全文索引与高级搜索条件
- [ ] 富文本 HTML 正文展示、远程图片控制和跟踪像素拦截设置
- [x] 顶部邮件入口和全局未读数角标

:::tip 会话归并规则

v3 只使用 Gmail `threadId` 或 Microsoft Graph `conversationId` 归并会话，不会仅凭相同主题把邮件合并。这样可以避免无关邮件因为主题相同而进入同一会话。

:::

### 5. 邮件状态与组织

- [x] 标记已读和未读
- [x] 添加和移除星标
- [x] 归档邮件
- [x] 移动邮件到 Provider 文件夹
- [x] 软删除——优先移动到 Trash / Deleted Items
- [x] 永久删除的服务端能力
- [x] 发现并同步 Provider 文件夹；Provider label 只作为 Provider 文件夹来源，不作为 NocoBase 本地标签
- [x] 邮件内部备注
- [x] 标记和取消邮件待办
- [ ] 在邮件中心选择任意目标文件夹移动邮件
- [x] 邮件管理页支持独立权限下批量标记已读、星标、归档、移动或删除
- [x] 新建带颜色的 NocoBase 本地邮件标签
- [x] 编辑名称、颜色和删除 NocoBase 本地邮件标签
- [x] 给邮件添加或移除本地标签
- [x] 本地标签操作不调用 Provider 标签接口，Provider 文件夹变化不会覆盖本地标签

### 6. 写信与发送

- [x] 新建邮件
- [x] 设置 To、CC 和 BCC
- [x] 选择发送账户并自动使用其主发件地址
- [x] 回复邮件
  - [x] 保留 `In-Reply-To` 和 `References`
  - [x] 使用 Provider 原生回复关系
- [x] 转发邮件
  - [x] 保留原邮件正文信息
  - [x] 保留原邮件附件
  - [x] 使用 Provider 原生转发关系
- [x] 定时发送
- [x] 每位收件人单独发送
  - [x] 每个收件人创建独立 submission
  - [x] 一次最多 100 位收件人
  - [x] 重试时保持逐收件人幂等
- [x] 发送请求幂等
- [x] 明确区分发送成功、失败和 Provider 结果未知
- [x] 查看当前用户的发送记录
- [x] 管理员查看全部账户的发送记录
- [x] 富文本编辑器
  - [x] 粗体、斜体、下划线、有序列表和无序列表
  - [x] 撤销、重做和清除格式
  - [x] 同时生成 HTML 正文和纯文本替代内容
  - [x] 字号、标题级别、链接和插入图片
  - [x] 过滤不安全的 HTML 标签、属性和链接
- [x] 默认签名自动插入，切换签名时替换原签名，模板覆盖已有内容前二次确认
- [x] To、CC、BCC 和发件人地址区域支持收缩与展开
- [x] `/dev/mail/send` 共用写信表单，底部支持发送和分别发送；批量结果与失败重试统一在邮件日志查看
- [x] 批量发送日志采用主子结构：主记录汇总人数与各状态数量，展开查看收件人明细；每页 20 个完整批次，支持按批次重试失败项或取消待发送项
- [x] 模板变量插值——比如从当前记录填入联系人姓名或订单号
- [ ] 已发送邮件撤回
- [ ] 发送前延迟和撤销发送
- [ ] 已读回执或送达回执
- [ ] 邮件优先级

### 7. 草稿

- [x] 本地草稿作为唯一可编辑来源，所有支持发信的 Provider 都可以保存、恢复和发送
- [x] Gmail 和 Microsoft 远端草稿作为可选同步镜像，镜像失败不阻断本地草稿
- [x] 打开已有本地草稿继续编辑
- [x] 发送已有本地草稿
- [x] 修改草稿收件人、主题和正文
- [x] 保留、添加或移除草稿附件
- [x] 回复和转发内容保存为本地草稿，并按能力同步远端镜像
- [x] 编辑过程中防抖自动保存到本地草稿
- [x] 离开编辑器前提示未保存内容
- [x] 当前标签页刷新后提示恢复未完成邮件
- [x] 显示草稿正在保存、已保存和保存失败状态
- [x] 本地草稿与远端镜像冲突时保留本地修改，支持查看远端版本或放弃本地修改

### 8. 附件

- [x] 上传发送附件
- [x] 下载收到的附件
- [x] 单个附件最大 25 MB
- [x] 单封邮件的新附件合计最大 25 MB
- [x] 上传接口限制 multipart 请求大小
- [x] 临时发送附件设置过期时间并自动清理
- [x] Gmail MIME 附件发送
- [x] Microsoft Graph 小附件直接发送
- [x] Microsoft Graph 3 MB 及以上附件使用 upload session 分片上传
- [x] Microsoft upload session 只接受 HTTPS 地址
- [x] 邮件正文内联图片通过 CID 匹配受保护的本地附件地址并显示
- [ ] 内联图片编辑与 CID 管理界面
- [ ] 文件预览
- [ ] 从 NocoBase 文件管理器选择附件
- [ ] 大于 25 MB 的云盘链接发送

### 9. 发件身份、别名与签名

- [x] 从 Provider 发现可用发件身份
- [x] 区分主地址和别名
- [x] 只允许使用 `canSend` 的身份发信
- [x] 写信时自动使用账户主发件地址
- [x] 编辑草稿时兼容恢复原发件地址
- [x] 为每个邮件账户配置共享签名
- [x] 发送新邮件、回复和转发时自动附加签名
- [x] Gmail 同步 send-as alias 及其签名
- [ ] 手动刷新发件别名的操作入口
- [x] 为同一账户维护多个签名
- [x] 写信时临时切换签名或不使用签名
- [x] 设置默认签名
- [ ] 按新邮件、回复等场景自动选择不同签名
- [x] 完整的富文本签名编辑器

### 10. 邮件模板

- [x] 当前用户创建私有模板
- [x] 查看、编辑和删除自己的模板
- [x] 保存模板名称、主题和正文
- [x] 在写信面板应用模板
- [x] 模板所有权校验
- [x] 通过 `templateVariables` 绑定当前记录等 NocoBase Context 数据
- [ ] 模板附件
- [x] 富文本模板编辑器

### 11. 管理与运维

- [x] 当前用户账户设置页
- [x] 管理员查看全部用户连接的邮箱账户
- [x] 独立权限的邮件管理页以表格查看全部账号邮件并执行批量操作
- [x] 管理员通过 API 查询全部同步记录和发送记录
- [x] 查看同步 mode、phase、状态、批次数和消息数
- [x] 查看发送 submission 状态和公开错误分类
- [x] Transactional Outbox 保证数据库状态与 Queue 调度衔接
- [x] Queue Job 执行同步和定时发送
- [x] revision fence 防止旧同步任务推进新状态
- [x] lease fence 防止失效 Worker 覆盖新结果
- [x] 恢复超时的发送 submission 和 Outbox 任务
- [x] Provider 限流、网络、超时和认证错误归一化
- [x] Push webhook 请求大小与单次通知数量限制
- [x] 通过 API 手动重试失败或已取消的同步任务
- [x] 通过 API 手动取消正在执行的同步任务
- [ ] 发送任务手动重试或取消
- [ ] 指标、告警和 OpenTelemetry 集成
- [ ] 邮件审计日志与合规保留策略
- [ ] 管理员强制断开或重新授权用户账户

### 12. Provider 扩展能力

- [x] `MailProviderDefinition` 注册协议
- [x] 每个账户创建独立 `MailProviderAdapter`
- [x] Provider capability 声明
  - [x] 收信和发信
  - [x] 增量同步和 Push
  - [x] 文件夹和 label
  - [x] 草稿和移动
  - [x] 发件身份和别名
- [x] Provider 自己管理协议调用、token refresh、cursor 和错误转换
- [x] Mail Core 管理权限、凭据、持久化、任务和一致性
- [x] Provider SDK 类型不会泄漏到 Mail Core 公共接口
- [ ] Provider capability 的结构化限制——比如消息大小、远程搜索和 ID 稳定性
- [x] Gmail、Microsoft 和 IMAP/SMTP Provider 兼容性测试套件
- [x] 第三方 Provider 开发指南
- [ ] 第三方 Provider 示例插件

### Provider API 调用方式

Gmail 和 Microsoft 365 Provider 目前直接调用各自的官方 REST API，没有引入 [Google APIs Node.js Client](https://github.com/googleapis/google-api-nodejs-client)（`googleapis`）或 [Microsoft Graph JavaScript SDK](https://learn.microsoft.com/en-us/graph/sdks/sdk-installation)（`@microsoft/microsoft-graph-client`）。这里的“直接调用”仍然使用 Gmail API、Google OAuth、Microsoft Graph 和 Microsoft identity 的官方 endpoint，不代表使用非官方接口。

选择 REST API 是因为 Provider 需要适配 `MailProviderAdapter`——Mail Core 管理权限、凭据存储、同步任务和一致性，Provider 管理 token refresh、Provider cursor、协议调用和错误转换。官方 SDK 可以减少请求构造和 API 类型定义，不过不能替代 Gmail History、Graph Delta、附件分片、Push subscription 续期和邮件标准化等 NocoBase 业务逻辑。

直接调用也让 Provider 能统一设置请求超时、响应大小限制、错误转换和测试 mock，并避免在每个 Provider 中增加额外的运行时依赖。代价是 Provider 需要自己维护 endpoint、API 类型和协议变化。

如果后续某个 Provider 使用的 API 范围显著扩大，或者手写请求的维护成本超过 SDK 依赖成本，可以在该 Provider 内部引入官方 SDK。SDK 类型和客户端对象仍然需要映射到 `MailProviderAdapter`，不能进入 Mail Core 公共接口。

## Provider 能力对比

| 能力       | Gmail                       | Microsoft 365                                     | IMAP/SMTP MVP                           |
| ---------- | --------------------------- | ------------------------------------------------- | --------------------------------------- |
| 授权方式   | OAuth 2.0 + PKCE            | OAuth 2.0 + PKCE                                  | 用户名和密码                            |
| 收信和发信 | 已实现                      | 已实现                                            | IMAP + SMTP 已实现                      |
| 首次同步   | Gmail message 分页          | Graph folder message 分页                         | IMAP 文件夹分页                         |
| 增量同步   | Gmail History               | Graph per-folder delta                            | UIDVALIDITY / UIDNEXT，主要发现新增邮件 |
| Push       | Gmail watch + Pub/Sub       | Graph subscription + webhook                      | 不支持                                  |
| 邮件组织   | Provider label 归一为文件夹 | folder                                            | folder，仅支持基础文件夹                |
| 原生会话   | `threadId`                  | `conversationId`                                  | 不提供，邮件按独立消息处理              |
| 草稿       | 本地草稿 + Gmail Draft 镜像 | 本地草稿 + Graph Draft 镜像                       | 本地草稿，Provider 不提供远端草稿       |
| 发件身份   | Gmail send-as               | Graph mailbox identities                          | 连接邮箱主身份                          |
| 大附件     | Gmail MIME，受 25 MB 总限制 | 3 MB 以下直接添加，3 MB 及以上使用 upload session | 由 SMTP 服务商限制                      |
| 移动和删除 | 支持移动、软删除和永久删除  | 支持移动、软删除和永久删除                        | 仅支持永久删除                          |

## 与 NocoBase v2 邮件管理插件对照

NocoBase v2 邮件管理插件已经形成了完整的产品入口和可配置区块。v3 当前更侧重邮件核心、Provider、同步可靠性和独立邮件中心。下面只列官方文档可以确认的 v2 能力。

| v2 能力                     | v3 当前状态  | 说明                                                                                       |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Gmail 和 Outlook OAuth 接入 | 已实现       | v3 内置 Gmail 与 Microsoft Provider 适配模块                                               |
| 多账户邮件中心              | 已实现       | v3 默认展示全部账户邮件，也支持切换账户、文件夹、搜索和原生会话                            |
| 手动和可配置自动同步        | 已实现并增强 | v3 默认同步全部可同步账户，支持通过 config 统一设置间隔、Push、可恢复分批同步和增量 cursor |
| 发送、查看、回复和转发      | 已实现       | v3 回复和转发使用 Provider 原生关系                                                        |
| 邮件签名                    | 已实现       | v3 支持每个账户维护多个共享签名、富文本编辑、设置默认值，并在写信时选择或关闭签名          |
| 邮件别名                    | 已实现       | v3 从 Provider 发现发件身份，发送时默认使用账户主发件地址                                  |
| 邮件模板                    | 已实现       | v3 当前范围包括私有模板的创建、编辑、删除和写信应用                                        |
| 邮件备注                    | 已实现       | v3 可在邮件详情中维护仅存于 NocoBase 的内部备注                                            |
| 邮件待办                    | 已实现       | v3 可把邮件标为待办，并在列表与详情中展示                                                  |
| 邮件标签管理                | 已实现       | v3 标签完全由 NocoBase 本地管理，不调用 Provider 标签接口                                  |
| 表格批量发送                | 不规划       | v3 保留写信入口中的逐收件人独立发送，不接入表格选中记录或全部记录                          |
| 自动保存草稿                | 已实现       | 编辑后防抖保存本地草稿，可按 Provider 能力同步远端镜像，并提供冲突提示                     |
| 邮件消息、详情和发送区块    | 不规划       | v3 使用固定邮件中心，不提供 FlowEngine 邮件区块                                            |
| 按业务数据范围过滤邮件区块  | 不规划       | 该能力依赖邮件区块，不计入 v3 范围                                                         |
| AI 员工参与总结、分析和写信 | 不规划       | 不计入 v3 邮件插件范围                                                                     |

## 后续功能优先级

下面的优先级用于安排 v3 后续补齐工作。已经完成的项目继续保留，方便查看实现进度。

### P0：补齐 NocoBase 内的核心使用闭环

- [x] 邮件编辑器实时自动保存草稿
- [x] 未保存内容保护和草稿恢复提示
- [x] 富文本邮件编辑器
- [x] 模板变量与当前记录数据绑定

模板使用 `{{path.to.value}}` 语法。把邮件中心嵌入记录页面时，通过 `MailWorkspacePage` 的 `templateVariables` 传入当前记录：

```tsx
<MailWorkspacePage
  templateVariables={{
    record, // 当前记录
  }}
/>
```

主题、HTML 正文和纯文本正文会在应用模板时使用同一份数据。找不到的变量会保留原占位符，方便在发送前发现配置问题。

### P1：补齐 v2 的邮件管理体验

- [x] 邮件备注
- [x] 邮件待办
- [x] NocoBase 本地标签创建、分配和移除
- [x] 多签名管理和写信时选择签名
- [x] 顶部邮件入口和全局未读数
- [x] 通过 API 重试失败或已取消的同步任务，以及取消进行中同步任务

AI 员工总结、分析、翻译和辅助写信不在 v3 邮件插件规划范围内。发送任务的自动重试可能造成重复邮件，因此未知结果不会盲目重发；操作日志仍会保留失败状态供人工判断。

### P2：高级能力与可维护性

- [ ] 邮件正文全文索引
- [ ] 文件预览、NocoBase 文件选择和大文件链接
- [ ] 邮件审计、保留策略、指标和告警
- [ ] 第三方 Provider 开发文档与兼容性测试套件

## v2 参考资料

以下资料用于核对 v2 的公开产品能力，核对日期为 2026-09-08：

- [邮件管理概述](https://docs.nocobase.com/cn/email-manager/)
- [邮件中心](https://docs.nocobase.com/cn/email-manager/usage/guide)
- [邮件区块](https://docs.nocobase.com/cn/email-manager/usage/configuration)
- [邮件签名](https://docs.nocobase.com/cn/email-manager/usage/signature)
- [邮件别名](https://docs.nocobase.com/cn/email-manager/usage/alias)
- [邮件模板](https://docs.nocobase.com/cn/email-manager/usage/template)
- [邮件备注](https://docs.nocobase.com/cn/email-manager/advanced/note)
- [邮件待办](https://docs.nocobase.com/cn/email-manager/advanced/todo)
- [邮件标签](https://docs.nocobase.com/cn/email-manager/advanced/label)
- [批量发送](https://docs.nocobase.com/cn/email-manager/advanced/batch-send)
- [自动保存草稿](https://docs.nocobase.com/cn/email-manager/advanced/auto-save-draft)
- [NocoBase 2.0-beta 发布说明](https://www.nocobase.com/cn/blog/2-0-beta)
