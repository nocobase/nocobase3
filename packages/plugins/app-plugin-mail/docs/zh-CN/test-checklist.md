---
title: '邮件插件测试清单'
description: '按测试层级整理 NocoBase v3 邮件插件当前可执行的功能、接口、服务、Provider、数据和非功能测试。'
keywords: 'NocoBase,邮件插件,测试清单,Gmail,Microsoft,IMAP,SMTP,草稿'
---

# 邮件插件测试清单

这份清单只收录当前已经具备实现基础、可以直接执行的测试用例。已确认但尚未完成的页面、权限、交互和验收规则放在 [邮件插件待实现清单](./pending-implementation.md)。

测试状态约定：[ ] 表示待执行，[x] 表示已执行并通过，[-] 表示不适用或暂不执行。自动化测试覆盖不等于真实 Provider 或完整页面验收通过；勾选前应记录执行环境、日期、结果和失败证据。

测试层级标识：[UI] 页面交互，[API] HTTP 接口，[SRV] 服务、队列和状态机，[PROVIDER] Provider 适配，[DATA] 数据库和一致性，[SEC] 权限与安全，[NFR] 性能、可用性和无障碍，[BOUNDARY] 产品边界。优先级标识：[P0] 核心链路，[P1] 重要能力，[P2] 增强能力。

部门、组织和成员范围不属于当前清单，等其他插件提供组织能力后再单独补充。

## 一、测试数据、页面范围与执行顺序

- [ ] 准备普通用户 A、普通用户 B 和管理员，并确认当前权限配置
- [ ] 准备已配置且启用的 Gmail、Microsoft 和 IMAP/SMTP Provider
- [ ] 准备已注册但未配置的 Provider，以及配置为 disabled 的 Provider
- [ ] 准备 active、suspended、reauthorizationRequired、revoked、connecting 和 removing 账号状态
- [ ] 准备多个账号、同一 Provider 多账号和不同用户相同 Provider 地址的数据
- [ ] 准备收件箱、已发送、草稿、垃圾箱、垃圾邮件、归档、自定义文件夹、本地标签和本地草稿远端冲突数据
- [ ] 准备已读、未读、星标、待办、备注、草稿、带附件和 HTML 正文的邮件
- [ ] 准备有 threadId/conversationId、无线程 ID、同主题不同会话的邮件
- [ ] 准备主地址、别名地址、不可发送地址、多签名和多模板数据
- [ ] 准备 0、1、100、101 个收件人，以及逗号和分号混合地址
- [ ] 准备 0 MB、25 MB、超过 25 MB 和多附件总量超过限制的附件
- [ ] 准备 Provider 认证失败、游标过期、404、5xx、超时、网络中断和重复回调场景
- [ ] 准备 0、1、99、100、101、10,000 和 10,001 封范围内邮件，以及早于、等于、晚于 receivedAfter 的邮件；记录 Provider 原始 ID 作为最终对账依据
- [ ] 准备 IMAP 稀疏 UID、乱序 FETCH、缺少 UIDNEXT、UIDVALIDITY 变化、多文件夹分页，以及小于、等于、超过 16 MiB 的邮件和损坏 MIME
- [ ] 准备可重复创建的测试邮箱、持久化测试数据库和两个运行实例；支持在提交前、提交后及队列投递后中断进程，并在历史扫描期间注入新邮件、更新和删除

| 页面         | 当前地址                  | 当前验证范围                               |
| ------------ | ------------------------- | ------------------------------------------ |
| 开发工作台   | `/dev/mail/center`        | 邮件工作台能力                             |
| 账号管理     | `/dev/mail/accounts`      | Provider、账号、签名、标签和模板           |
| 邮件管理     | `/dev/mail/management`    | 独立权限下查看全部账号邮件、筛选和批量操作 |
| 批量发件     | `/dev/mail/bulk-send`     | 收件人解析、预览、逐收件人发送和失败重试   |
| 发送调试页   | `/dev/mail/send`          | 单封发送接口和基本参数                     |
| 用户同步日志 | `/dev/mail/sync-logs`     | 当前用户同步记录                           |
| 用户发送日志 | `/dev/mail/send-logs`     | 当前用户发送记录                           |
| 管理员账号   | `/settings/mail/accounts` | 全部用户账号的只读查看                     |

## 二、[UI][SEC] 路由、权限与通用页面状态

- [ ] [P0][UI] MAIL-ROUTE-001：插件启用后当前页面范围内的所有路由均能加载，懒加载页面无报错
- [ ] [P0][SEC] MAIL-ROUTE-002：未登录在浏览器访问邮件页面时跳转登录，未登录直接调用邮件接口时返回 401
- [ ] [P0][SEC] MAIL-ROUTE-003：没有 `mail.workspace` 权限访问 `/dev/mail/center`、`/dev/mail/accounts` 和 `/dev/mail/send` 时返回 403
- [ ] [P0][SEC] MAIL-ROUTE-004：没有 `mail.admin` 权限访问 `/settings/mail/accounts`，或没有 `mail.management` 权限访问 `/dev/mail/management` 时返回 403
- [ ] [P0][SEC] MAIL-ROUTE-005：用户 A 无法查看或操作用户 B 的账号、邮件、草稿、附件、标签、模板和日志
- [ ] [P0][UI] MAIL-UI-001：页面加载中、空数据、接口失败、重试和刷新状态显示正确
- [ ] [P0][SEC] MAIL-UI-002：接口错误显示安全的本地化错误信息，不暴露凭据、游标、租约和内部堆栈
- [ ] [P1][UI] MAIL-UI-003：重复点击按钮、快速切换页面或离开页面时不产生重复请求和未处理异常
- [ ] [P1][UI] MAIL-UI-004：中文、英文和 Provider 错误信息均能正确显示
- [ ] [P1][UI] MAIL-UI-005：长主题、长地址、大量标签、大量附件和窄窗口不会破坏布局
- [ ] [P1][NFR] MAIL-UI-006：Dialog、Sheet、Select、表格和富文本编辑器支持键盘操作与正确焦点管理

## 三、[UI][SEC] 账号与 Provider 管理

- [ ] [P0][UI] MAIL-ACCOUNT-001：账号页展示 Provider、账号数量、账号地址、账号状态、初始同步日期；不展示自动同步间隔配置入口
- [ ] [P0][UI] MAIL-ACCOUNT-002：Provider 列表正确区分已配置、未配置和 disabled 状态；未配置或 disabled Provider 不可连接
- [ ] [P0][UI] MAIL-ACCOUNT-003：已配置 OAuth Provider 显示授权入口，已配置 IMAP/SMTP Provider 显示连接表单
- [ ] [P1][UI] MAIL-ACCOUNT-004：Provider 卡片正确显示 receive、send、folders、drafts、move、aliases 和 push 能力，不把 Provider labels 当成本地标签前置条件
- [ ] [P0][UI] MAIL-ACCOUNT-005：切换 IMAP/SMTP Provider 时地址、用户名、密码和显示名称清空；OAuth Provider 不显示密码字段
- [ ] [P0][SEC] MAIL-ACCOUNT-006：IMAP/SMTP 密码输入框为密码类型，页面和接口响应均不回显密码；地址、用户名或密码为空时不能提交
- [ ] [P0][API][PROVIDER] MAIL-ACCOUNT-007：IMAP/SMTP 同时验证 IMAP 和 SMTP，任一失败都不保存账号或凭据
- [ ] [P1][UI] MAIL-ACCOUNT-008：初始同步日期默认最近 90 天，可修改并以 ISO 时间传递
- [ ] [P0][UI][API] MAIL-ACCOUNT-009：OAuth 连接跳转到正确授权地址，并包含 callback、state 和 PKCE 参数
- [ ] [P0][UI][API] MAIL-ACCOUNT-010：OAuth、IMAP/SMTP 连接成功后返回账号页并展示账号；失败时不创建半成品账号、不保存凭据并显示安全错误
- [ ] [P0][SEC] MAIL-ACCOUNT-011：同一 Provider 地址的普通重复连接被拒绝；用户 B 不能连接用户 A 已绑定的 Provider 账号，且双方数据不受影响
- [ ] [P1][UI] MAIL-ACCOUNT-012：多个账号之间的邮件、身份、签名和同步记录互不混淆
- [ ] [UI] MAIL-ACCOUNT-013：账号状态 active 与 suspended 可以切换；suspended、reauthorizationRequired 和 revoked 账号不能发送或同步
- [ ] [UI][SEC] MAIL-ACCOUNT-014：reauthorizationRequired 账号通过「关联账户」完成 OAuth 或 IMAP/SMTP 重新授权后恢复为 active，保留原账号 ID、本地邮件、签名和同步关系
- [ ] [UI] MAIL-ACCOUNT-015：删除账号前显示确认并提示只删除本地数据；取消删除不改变账号
- [ ] [API][SRV] MAIL-ACCOUNT-016：删除账号后本地邮件、文件夹、同步记录、凭据和相关数据被清理，不删除 Provider 侧邮件
- [ ] [SRV] MAIL-ACCOUNT-017：删除账号时正在运行的同步被取消，后续队列不会继续写入该账号；删除失败时账号不残留错误状态
- [ ] [UI][SRV] MAIL-ACCOUNT-018：同步进行中时 Sync 按钮禁用，进度、阶段、消息数和批次数持续更新；刷新只刷新数据，不创建重复任务
- [ ] [UI] MAIL-ACCOUNT-019：账号页可以打开签名、标签和模板管理入口，并按账号或用户范围加载数据
- [ ] [UI][DATA] MAIL-ACCOUNT-020：签名、标签或模板保存后关闭并重新打开，数据仍然可见；无账号时标签和模板仍按用户范围可管理

## 四、[UI] 工作台、详情与当前邮件操作

- [ ] [P0][UI] MAIL-CENTER-001：无账号时显示空状态和连接账号入口；首次进入默认使用全部账号视图
- [ ] [P0][UI] MAIL-CENTER-002：切换账号后清除原账号的文件夹、标签和智能筛选状态，不残留旧账号结果
- [ ] [P0][UI] MAIL-CENTER-003：全部账号和单账号视图在缺少 Provider 文件夹时仍显示收件箱、已发送、草稿箱、垃圾箱、垃圾邮件和归档默认文件夹；当前账号自定义文件夹显示在默认文件夹之后
- [ ] [P1][UI] MAIL-CENTER-004：全部、未读和星标智能视图的结果正确，切换智能视图后旧结果和旧状态被清理
- [ ] [P1][UI] MAIL-CENTER-005：文件夹筛选和本地标签筛选可以同时生效，分别取消时筛选状态与接口结果一致且不产生重复结果
- [ ] [P1][UI][API] MAIL-CENTER-006：关键字搜索会 trim，约 300 ms 防抖后按主题、摘要、发件人显示名称、发件人地址、收件人显示名称和收件人地址包含匹配，不匹配正文
- [ ] [P1][UI] MAIL-CENTER-007：快速输入或快速切换筛选时，过期请求不会覆盖新结果；账号视图和全部账号视图范围正确
- [ ] [P1][UI] MAIL-CENTER-008：列表分页、Load more 和游标翻页无重复和遗漏，加载失败可以重试
- [ ] [P1][UI] MAIL-CENTER-009：列表显示发件人、收件人、主题、摘要、时间、已读、星标、待办、备注、标签、附件和来源账号；未选中时本地标签仍持续显示
- [ ] [P0][UI] MAIL-CENTER-010：同一账号且具有相同 conversationId/threadId 的邮件正确加载会话；不同账号或无原生会话 ID的邮件不错误合并
- [ ] [P1][UI] MAIL-CENTER-011：点击普通邮件加载完整详情，点击会话邮件加载会话消息，会话分页可以加载更早消息
- [ ] [P1][UI] MAIL-CENTER-011A：同一会话的每封邮件可独立折叠和展开，折叠时保留发件人、时间和摘要
- [ ] [P1][SEC] MAIL-CENTER-012：HTML 正文经过清洗，危险标签、属性和链接不会执行；没有安全 HTML 时回退显示纯文本或摘要
- [ ] [P1][UI] MAIL-CENTER-013：正文中的链接、普通图片、CID 内联图片、样式和换行显示符合安全规则，CID 只匹配当前邮件的 inline 附件，附件可以下载，下载失败显示错误
- [ ] [P1][UI] MAIL-CENTER-014：未读、星标、备注、待办和本地标签操作在列表和详情中即时同步显示
- [ ] [P1][UI][SEC] MAIL-CENTER-015：未读徽标在首次加载、定时刷新、实时事件、窗口 focus 和重连后正确刷新，其他用户事件不会污染当前状态
- [ ] [P0][API][SRV] MAIL-ACTION-001：已读/未读和星标/取消星标状态正确持久化；Provider 提供对应操作时同步远端，不提供时仅更新本地且不调用不存在的远端操作
- [ ] [P1][UI][API] MAIL-ACTION-002：备注 trim 后保存，空备注保存为 null；已保存备注可以再次编辑并覆盖保存，取消编辑不会丢失原备注
- [ ] [P1][UI][API] MAIL-ACTION-003：待办状态可以切换，并在列表和详情同步显示
- [ ] [P1][UI][API] MAIL-ACTION-004：本地标签可以添加和移除，重复添加不会产生重复关联，删除标签只移除关联不删除邮件
- [ ] [P0][SEC] MAIL-ACTION-004A：本地标签创建、编辑、删除和关联不调用 Gmail、Microsoft 或 IMAP/SMTP 的 Provider 标签接口，Provider 文件夹变化不覆盖本地标签
- [ ] [P1][UI][API] MAIL-ACTION-005：Archive、移动和删除按照 Provider capabilities 执行；不支持的操作不显示，直接调用接口时返回明确错误
- [ ] [P1][SEC] MAIL-ACTION-006：对 inactive 账号或不属于当前用户的邮件执行操作时被拒绝
- [ ] [SRV][DATA] MAIL-ACTION-007：操作成功、失败和并发冲突时页面状态、接口结果和本地数据最终一致

## 五、[UI][SRV] 发送、草稿与附件

- [ ] [P0][UI] MAIL-SEND-001：工作台 Composer 和 `/dev/mail/send` 均能打开发送表单并提交单封邮件
- [ ] [P0][UI] MAIL-SEND-002：发送表单可以选择账号的发件人地址，列表包含主地址和全部可发送别名，不显示独立的发件身份选择器
- [ ] [P0][UI] MAIL-SEND-003：生产 Composer 支持逗号、分号混合分隔收件人；To、CC、BCC 地址 trim、去空和格式校验正确
- [ ] [P0][API] MAIL-SEND-004：To 至少一个、最多 100 个；主题或正文为空、超出长度限制时被拒绝且不发送请求
- [ ] [P1][UI] MAIL-SEND-005：当前富文本支持粗体、斜体、下划线、有序列表、无序列表、撤销、重做和清除格式
- [ ] [P1][UI] MAIL-SEND-005A：富文本支持字号、标题级别、链接和插入图片，编辑器生成的内容在保存、预览和发送后保持一致
- [ ] [P1][SEC] MAIL-SEND-006：发送内容同时生成安全 HTML 和纯文本 fallback，危险 HTML、属性、协议和资源地址被清理
- [ ] [P0][UI] MAIL-SEND-006A：新建邮件默认插入默认签名，切换签名替换原签名，切换为无签名移除原签名；模板覆盖已有内容前二次确认
- [ ] [P0][API][PROVIDER] MAIL-SEND-007：回复和转发保留原邮件关系、In-Reply-To、References、主题和原邮件附件；reply 与 forward 不能同时设置
- [ ] [P0][SRV][PROVIDER] MAIL-SEND-008：Provider 返回 accepted、明确失败、网络中断、5xx 或未知结果时分别显示 accepted、failed 或 unknown，不误报结果
- [ ] [P0][SRV] MAIL-SEND-009：相同 idempotency key 和相同内容重复提交只产生一次发送；相同 key 内容不同返回冲突
- [ ] [P1][SRV] MAIL-SEND-010：定时发送时间晚于当前时间，显示本地和 UTC 时间，到期后由 Outbox/Queue 发送且重试不产生重复邮件
- [ ] [P1][UI][SRV] MAIL-SEND-011：当前 Composer 的逐收件人发送支持 1–100 个收件人，每位收件人生成独立 submission；自动保存、已有草稿或保留附件时逐收件人选项禁用
- [ ] [P0][UI] MAIL-SEND-012：提交中按钮防止重复点击，发送完成后 Composer 正确关闭或保留失败状态
- [ ] [P0][UI][SRV] MAIL-DRAFT-001：本地草稿作为唯一可编辑来源，所有支持发信的 Provider 都可以新建、编辑、自动保存、继续编辑和发送，保存状态和失败状态显示正确
- [ ] [P1][SRV][API] MAIL-DRAFT-001A：Gmail 和 Microsoft 远端草稿作为可选镜像，镜像失败不阻断本地草稿，IMAP/SMTP 仍可保存本地草稿
- [ ] [P1][UI][API] MAIL-DRAFT-001B：本地草稿与远端镜像内容冲突时保留本地修改，显示远端版本摘要，并支持查看远端版本或放弃本地修改
- [ ] [P1][UI][SEC] MAIL-DRAFT-002：草稿只能由当前用户和所属账号访问，回复草稿和转发草稿保留原邮件关系
- [ ] [P1][UI] MAIL-DRAFT-003：关闭 Composer、刷新页面或打开新标签页时，对未保存内容显示恢复或放弃提示；损坏的 sessionStorage 不导致页面崩溃
- [ ] [P1][SRV] MAIL-DRAFT-004：发送成功后本地草稿被删除或标记为已发送，支持的远端草稿随后清理；清理失败不回滚已成功发送
- [ ] [P1][UI][API] MAIL-DRAFT-005：草稿附件可以保留、增加、删除和重新发送，不重复发送附件
- [ ] [P0][API] MAIL-ATTACH-001：multipart 请求缺少 file、文件名或内容类型时被拒绝；有效附件可以上传和发送
- [ ] [P0][API] MAIL-ATTACH-002：单个附件和多附件总大小超过限制时被拒绝，限制内附件可以发送
- [ ] [P1][SRV][DATA] MAIL-ATTACH-003：附件上传失败时请求失败且不留下可访问的附件元数据；成功上传但未关联邮件的附件过期后不能下载，并由维护任务删除存储对象和元数据
- [ ] [P1][SEC] MAIL-ATTACH-004：用户 A 不能下载、发送或删除用户 B 的附件，下载文件名经过安全处理
- [ ] [P1][PROVIDER] MAIL-ATTACH-005：Gmail、Microsoft 和 IMAP/SMTP 适配器使用正确 MIME、普通发送或 upload session 路径，异常时释放资源

- [ ] [P0][UI] MAIL-BULK-001：`/dev/mail/bulk-send` 仅加载当前用户可发送账号和主地址/可发送别名，收件人支持换行、逗号、分号录入、去重、逐项编辑、删除和清空
- [ ] [P0][UI][API] MAIL-BULK-002：批量发件预览显示账号、发件地址、收件人、主题、正文和附件摘要，确认后每位收件人独立提交
- [ ] [P1][UI][SRV] MAIL-BULK-003：批量结果显示 accepted、failed、unknown、pending 和 cancelled，失败收件人可单独重试且已接受项不重复发送

## 六、[UI][API] 身份、签名、模板和本地标签

- [ ] [P1][UI] MAIL-IDENTITY-001：身份按账号展示，主地址、别名和 canSend 状态正确
- [ ] [P1][SEC] MAIL-IDENTITY-002：身份和别名按账号隔离，不能跨账号误用或通过参数越权
- [ ] [P1][UI][DATA] MAIL-SIGNATURE-001：签名按账号分组，支持新建、编辑、选择、设为默认和删除
- [ ] [P1][DATA] MAIL-SIGNATURE-002：新账号的第一条签名成为默认签名，删除默认签名后自动提升替代签名
- [ ] [P1][SEC] MAIL-SIGNATURE-003：签名名称和内容为空或超长时不能保存，签名不能跨账号误用
- [ ] [P1][UI][API] MAIL-SIGNATURE-004：签名编辑器支持字号、标题级别、链接、插入图片、列表和清除格式，保存后 HTML 与纯文本均正确，切换签名不会丢失格式
- [ ] [P1][UI][API] MAIL-TEMPLATE-001：模板仅当前用户可见，支持新建、编辑、删除、取消、重置和按名称排序
- [ ] [P1][API] MAIL-TEMPLATE-002：模板名称或主题为空时不能保存，模板所有权校验正确
- [ ] [P1][UI][API] MAIL-TEMPLATE-003：模板支持富文本内容和变量渲染，嵌套变量、未知变量和 HTML 转义结果正确
- [ ] [P1][SEC] MAIL-TEMPLATE-004：模板中的危险 HTML、脚本和危险链接被清理，管理员不能默认查看或修改其他用户的私有模板
- [ ] [P1][UI][API] MAIL-LABEL-001：本地标签支持创建、编辑名称和颜色、删除和应用，名称 trim、空名称和重复名称校验正确
- [ ] [P1][UI] MAIL-LABEL-002：标签列表按名称排序并显示数量，空状态、创建失败、更新失败和删除失败状态正确
- [ ] [P1][SEC] MAIL-LABEL-003：本地标签只能由所属用户管理，删除标签只移除邮件关联不删除邮件

## 七、[UI][SEC] 邮件管理页和日志页面

- [ ] [P1][UI] MAIL-MANAGE-001：`/dev/mail/management` 在 `mail.management/access` 权限下以表格加载全部账号和已同步邮件，展示表头、行数据、空状态、加载状态和错误状态
- [ ] [P1][UI] MAIL-MANAGE-002：管理页按账号筛选，并按主题、摘要、发件人和收件人搜索；防抖、清空搜索和结果刷新正确
- [ ] [P1][UI] MAIL-MANAGE-003：管理表格展示账号、发件人、收件人、主题、摘要、读状态、星标、草稿、文件夹、附件、时间和 Provider message ID
- [ ] [P1][UI] MAIL-MANAGE-004：管理页默认每页显示 20 封邮件，可选择每页 20、50 或 100 条，切换条数回到第一页并清空选择，使用上一页、下一页和当前页码导航，首页禁用上一页、末页禁用下一页；翻页替换表格并清空选择，切换账号、搜索或手动刷新回到第一页；请求失败保留当前页，过期请求不会覆盖新结果，批量操作后刷新当前页并保留失败项选择
- [ ] [P0][SEC] MAIL-MANAGE-005：没有 `mail.management/access` 时不能打开管理页、读取管理数据或调用批量操作；有权限时可查看全部账号但不能越权调用普通用户接口
- [ ] [P0][UI][API] MAIL-MANAGE-006：管理页支持当前页单选、多选、全选、取消全选、标记已读/未读、星标/取消星标、归档、移动和删除；批量操作确认目标并逐项展示成功、失败和部分失败
- [ ] [P0][UI][SEC] MAIL-MANAGE-007：Trash 中永久删除前显示二次确认，取消不改变邮件；部分失败项保留可追踪状态并可重试，重复点击不产生重复操作
- [ ] [P1][UI] MAIL-USER-SYNCLOG-001：用户同步日志只显示当前用户账号和同步运行，展示模式、状态、阶段、进度、消息数、批次数和时间
- [ ] [P1][SEC] MAIL-USER-SYNCLOG-002：用户同步日志不暴露同步游标、lease 和 Provider 原始错误信息
- [ ] [P1][UI] MAIL-USER-SENDLOG-001：用户发送日志只显示当前用户记录，展示账号、状态、submissionId、providerMessageId、时间和错误码
- [ ] [P1][UI] MAIL-USER-SENDLOG-002：accepted、failed、unknown、pending 和 cancelled 状态以及定时发送前后变化显示正确
- [ ] [P0][API][SEC] MAIL-ADMIN-LOG-001：管理员操作日志 API 可查询所有用户的同步和发送操作，普通用户访问被拒绝
- [ ] [P0][API][SEC] MAIL-ADMIN-LOG-005：管理员操作日志 API 中的错误只返回公开错误码和安全摘要

## 八、[API][SEC] 接口、OAuth 与安全

- [ ] [P0][SEC] MAIL-AUTH-001：OAuth callback 只消费预先创建且未过期的授权事务，伪造、缺失、过期或重复 state 被拒绝
- [ ] [P0][SEC] MAIL-AUTH-002：PKCE verifier 只保存在服务端凭据存储，不出现在前端、日志或接口响应中
- [ ] [P0][SEC] MAIL-AUTH-003：Provider error 或用户拒绝授权时不创建账号，回调失败不暴露 Provider 敏感信息
- [ ] [P0][SRV][SEC] MAIL-AUTH-004：OAuth 重新授权使用原 Provider subject 更新原账号，不创建重复账号；refresh token 轮换和并发刷新不会覆盖错误凭据
- [ ] [P1][SEC] MAIL-AUTH-005：凭据存储租约、释放和异常恢复正确，过期临时凭据可以清理
- [ ] [P0][SEC] MAIL-AUTH-006：Webhook challenge 只在合法请求下返回，错误 secret、clientState、超大请求、格式异常或缺少必要字段被拒绝
- [ ] [P0][SEC] MAIL-AUTH-007：修改 URL、accountId、messageId、attachmentId、folderId、labelId、templateId 或 submissionId 不能越权
- [ ] [P0][SEC] MAIL-API-001：无效 ID、账号归属、Provider 能力和状态被拒绝，错误使用安全的 4xx 状态和错误码
- [ ] [P0][API] MAIL-API-002：JSON 请求、附件请求、主题、正文、To、CC、BCC、调度时间、附件 ID 和批量收件人数校验正确
- [ ] [P1][API] MAIL-API-003：分页 limit、cursor、startedAfter、startedBefore 和布尔参数校验正确，查询参数和文件名正确 URL 编码
- [ ] [P0][SEC] MAIL-API-004：账号、邮件、草稿、附件、签名、模板、标签和日志接口按当前用户或管理员权限隔离
- [ ] [P0][SEC] MAIL-API-005：接口响应不返回 credentialReference、authorizationSubject、OAuth verifier、access token、refresh token、同步游标或租约字段
- [ ] [P0][SEC] MAIL-API-006：HTML 正文、模板、签名、文件名和错误信息不能造成 XSS
- [ ] [P1][API] MAIL-API-007：草稿接口允许当前草稿规则所需的空收件人、空主题和空正文，发送接口仍执行完整校验
- [ ] [P0][SRV] MAIL-API-008：相同幂等 key 和内容重复提交不重复执行，不同内容返回冲突
- [ ] [P1][DATA] MAIL-API-009：数据库写入成功但实时通知失败时不回滚核心业务数据，Outbox、发送租约和同步租约恢复后不重复执行
- [ ] [P1][DATA] MAIL-API-010：账号删除级联清理本地邮件、同步、草稿、发送记录和凭据关系，但不删除 Provider 侧邮件

## 九、[SRV] 同步、发送任务与一致性

- [ ] [P0][SRV] MAIL-SYNC-001：新账号连接后创建初始同步任务，按 receivedAfter 筛选，超过 10,000 封仍持续分页直至扫描完成
- [ ] [P1][SRV] MAIL-SYNC-002：未配置 syncBatchSize 时每批默认 100 封；syncBatchSize 可配置为 1–200，越界配置被拒绝；maxMessages 即使传入 1 也不截断历史同步
- [ ] [P0][SRV] MAIL-SYNC-003：当前账号同步只处理该账号，Sync all 只处理 active 账号；suspended、revoked 和 reauthorizationRequired 账号不启动同步
- [ ] [P0][SRV] MAIL-SYNC-004：不支持 incrementalSync 的 Provider 不触发增量同步，同一账号已有 active 同步时不会创建重复运行
- [ ] [P1][SRV] MAIL-SYNC-005：同步阶段、processed messages、pages、batches、时间和错误码持续更新，跨页面刷新或进程重启后可继续执行
- [ ] [P0][SRV] MAIL-SYNC-006：初始和增量同步按批次处理，单页失败按重试规则恢复，不丢失或重复邮件
- [ ] [P0][SRV] MAIL-SYNC-007：增量同步按 Provider 能力处理新增、更新、删除、移动和文件夹移除；游标过期后按指定日期范围重新扫描，并捕获扫描期间的新变化，禁止仅刷新 baseline 后跳到当前进度
- [ ] [P1][SRV] MAIL-SYNC-008：游标不前进时触发保护逻辑，不进入无限循环；可重试错误释放租约并重新入队
- [ ] [P0][SRV] MAIL-SYNC-009：认证终止错误将账号置为 reauthorizationRequired，不可重试错误标记为 failed 并保留安全错误码
- [ ] [P1][SRV] MAIL-SYNC-010：取消 pending 或 running 同步后不继续处理，只有账号所有者可以重试或取消自己的同步
- [ ] [P0][SRV] MAIL-SYNC-011：旧任务、旧 revision 和旧 lease 的队列消息不能覆盖新状态，Outbox relay、Queue job、lease heartbeat 和恢复机制正常
- [ ] [P1][UI][SRV] MAIL-SYNC-012：账号页不提供自动同步配置；config 中的 mail.automaticSyncIntervalMs 统一作用于新账号和已有账号，历史账号间隔不影响调度；自动同步只在该账号距离上次同步达到配置间隔后执行，手动同步、自动同步和 Push webhook 同时触发时同一账号只有一个有效同步任务
- [ ] [P1][SRV] MAIL-SYNC-013：Gmail watch 和 Microsoft subscription 可以创建、续期、过期重建和删除；Push 不可用时按当前实现回退到自动同步
- [ ] [P1][SRV] MAIL-SYNC-014：重复 Push 事件被去重，IMAP/SMTP 不创建 Push 订阅，账号删除或状态变化与同步并发时最终状态一致

### 日期范围、批次和完成条件

- [ ] [P0][SRV][PROVIDER] MAIL-SYNC-015：分别测试未指定 receivedAfter 和指定有效日期；前者扫描全部历史，后者包含恰好位于边界的邮件并排除更早的历史邮件，无效日期被拒绝
- [ ] [P0][SRV][DATA] MAIL-SYNC-016：用 0、1、99、100、101 封邮件验证空邮箱、恰好满批和跨批场景；空页仍有 nextCursor 时继续扫描，仅在历史无后续页且增量已追平后结束
- [ ] [P0][SRV][DATA] MAIL-SYNC-017：用超过 10,000 封真实范围内邮件完成同步，最终按账号和 Provider ID 对账无遗漏、无重复；processedMessages 是处理次数，重扫和更新可重复计数，不能代替唯一邮件数对账
- [ ] [P0][SRV] MAIL-SYNC-018：多页历史同步期间持续注入新邮件；baseline 就绪后历史页与增量页交替执行，新邮件无需等待全部历史完成；历史和增量游标分别保存，增量仍有后续页时历史也能继续推进
- [ ] [P0][DATA] MAIL-SYNC-019：增量页先更新某封邮件，后续历史页再返回其旧内容和状态；已同步的新状态不被覆盖，本地备注、待办和标签保留
- [ ] [P0][DATA] MAIL-SYNC-020：增量页先删除某封邮件，后续历史页再返回该邮件；同次扫描不使其重新出现，完成或重新开始扫描时清理对应删除标记

### 重启续跑与事务一致性

重启用例必须保留同一测试数据库并启用 Mail runtime。分别在首次同步和游标失效后的恢复扫描执行；浏览器刷新不能替代服务进程重启。恢复调度在启动时和每分钟运行，接管时间还受剩余租约、两分钟无进展阈值、重试时间和队列处理时间影响，不以“重启后立即完成”作为断言。

- [ ] [P0][SRV][DATA] MAIL-SYNC-021：历史页提交前中断进程；重启后重做未提交页，邮件、历史游标、增量游标与下一任务均不出现部分提交
- [ ] [P0][SRV][DATA] MAIL-SYNC-022：历史页或增量页提交后、下一任务执行前中断进程；重启后继续原运行的已持久化阶段和游标；连续重启两次仍能完成，不要求用户再次点击 Sync
- [ ] [P0][SRV][DATA] MAIL-SYNC-023：队列消息已发布但 worker 尚未领取时丢失消息；无租约且超过两分钟无进展后，恢复调度补发任务并增加 revision，原任务迟到不能重复提交
- [ ] [P0][SRV][DATA] MAIL-SYNC-024：worker 执行中停止且租约到期；恢复调度接管，旧 worker 恢复后提交被拒绝，接管者从最后成功检查点继续
- [ ] [P0][SRV] MAIL-SYNC-025：仍有 pending 或 publishing Outbox 的运行不被重复补发；延迟重试保留 availableAt，恢复调度不会绕过 Provider 的退避时间
- [ ] [P0][SRV][DATA] MAIL-SYNC-026：两个实例同时扫描同一失联运行，只有一个成功补发；另准备 100 个更早、仍有排队 Outbox 的运行，后面的失联运行也能被发现和接管
- [ ] [P0][SRV][DATA] MAIL-SYNC-027：注入租约丢失或下一条 Outbox 写入失败，邮件、文件夹、同步状态和游标整体回滚；再次执行不跳过该页
- [ ] [P0][SRV] MAIL-SYNC-028：对 cancelled、completed、partial、failed 运行执行恢复调度，不自动复活；取消或删除账号后投递旧任务也不能继续写入

### 游标失效与恢复扫描

- [ ] [P0][SRV][DATA] MAIL-SYNC-029：分别在历史页和增量页注入游标失效；运行回到 preparing 并标记 recovering，清除失效检查点，保留批次大小与适用的初始同步日期，不删除已有本地邮件
- [ ] [P0][SRV][PROVIDER] MAIL-SYNC-030：在旧检查点与当前时间之间放入尚未同步的邮件，再触发失效；重新扫描必须导入日期范围内的缺口邮件，不能把当前 Provider 游标直接记为同步完成
- [ ] [P0][SRV][DATA] MAIL-SYNC-031：恢复扫描建立新 baseline 后再注入新邮件，并在中途重启；历史完成后仍能通过增量读到新邮件，账号最终只有一个有效运行
- [ ] [P1][SRV] MAIL-SYNC-032：恢复期间再次发生游标失效，重新进入扫描流程；保留已有数据和本地标注，不错误标记 completed，也不绕过日期范围

### 大邮件、解析失败与独立正文重试

- [ ] [P0][PROVIDER][DATA] MAIL-SYNC-033：同一页依次放入超大邮件、解析失败邮件和正常邮件；前两封分别保存 deferred、failed 记录及可取得的元数据，正常邮件继续导入，成功保存后才推进页游标
- [ ] [P0][SRV][DATA] MAIL-SYNC-034：网络、认证或 Provider 请求失败导致无法取得必要记录时，保留原检查点并按错误分类重试或失败；不能把请求失败当作已保存的正文异常而跳过
- [ ] [P1][UI][SRV] MAIL-SYNC-035：历史和增量均追平但账号仍有未完成正文时，运行状态为 partial，pendingMessages 与未完成记录数一致；没有未完成正文时为 completed
- [ ] [P1][UI][API] MAIL-SYNC-036：邮件正文区域显示未完成提示和可用的大小信息；点击加载后显示忙碌状态，失败显示提示并可再次重试，成功展示正文；刷新后读取已持久化内容
- [ ] [P0][API][SEC] MAIL-SYNC-037：POST /api/mail/accounts/:accountId/messages/:messageId/content/retry 要求登录且校验账号和邮件所有权；未登录返回 401，用户 B、错配账号和仅有管理查看权限的用户不能替所有者重试正文
- [ ] [P0][DATA] MAIL-SYNC-038：正文重试只更新正文、附件及内容状态，保留已读、星标、本地备注、待办和标签；已经 complete 的邮件直接返回现有记录，不重复拉取正文
- [ ] [P1][UI] MAIL-SYNC-039：同步日志区分历史导入、恢复扫描和正文部分完成；已完成日志的 pendingMessages 是完成时快照，独立正文重试不改写旧日志，后续同步记录反映新的数量
- [ ] [P1][UI][SEC] MAIL-SYNC-040：管理邮件详情可显示正文未完成提示，但不提供所有者专属重试操作；正常完整邮件仍按原方式显示 HTML 或纯文本

### 自动化覆盖与实测入口

下表列出当前可复用的自动化测试，定位已有断言，不表示上面每个验收用例都已完整覆盖。Provider 测试使用模拟响应；SQLite 检查点测试通过重建 Store 和推进时钟模拟恢复，不能替代真实进程故障、真实邮箱大数据量和真实服务端协议验证。

| 测试文件                                                                                          | 已有覆盖重点                                                                                                                                              | 仍需实测或补充的边界                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [sync-recovery.test.ts](../../tests/sync-recovery.test.ts)                                        | 超过旧累计计数后继续分页、重建 Store 续跑、历史与增量交替、旧状态保护、删除标记、失效重扫、租约接管、丢失投递、双实例竞争、队列筛选、partial 与所有权重试 | 当前万封测试直接设置 processedMessages，需另做 10,001 封真实数据对账；实际杀进程、重复重启和启动调度接管 |
| [store-transactions.test.ts](../../tests/store-transactions.test.ts)                              | 租约丢失或 Outbox 冲突时邮件、文件夹和检查点回滚                                                                                                          | 提交前后进程故障注入                                                                                     |
| [mail-runtime.test.ts](../../tests/mail-runtime.test.ts)                                          | 初始同步、自动调度间隔、Push 去重、分页、错误恢复、取消及日志隔离                                                                                         | 真实队列投递中断与多进程调度                                                                             |
| [Gmail 测试](../../tests/adapters/gmail/gmail.test.ts)                                            | mailbox history ID、分页、History 404 失效、异常邮件元数据                                                                                                | 真实 history/token 失效及日期边界                                                                        |
| [Microsoft 测试](../../tests/adapters/microsoft/microsoft.test.ts)                                | baseline 分页、delta 追赶、新文件夹与历史期间到信                                                                                                         | Graph 410、异常单封内容、baseline 准备中重启                                                             |
| [IMAP 测试](../../tests/adapters/imap-smtp/imap-smtp.test.ts)                                     | 稀疏与乱序 UID、缺少 UIDNEXT、UIDVALIDITY、收件时间边界、大邮件与异常 MIME、按需正文                                                                      | 多种真实 IMAP 服务、恰好 16 MiB、长时间断线和 UIDVALIDITY 重置                                           |
| [正文组件测试](../../tests/mail-message-content.test.tsx)、[接口测试](../../tests/routes.test.ts) | 未完成提示、失败后重试、成功展示正文、登录检查及重试服务调用                                                                                              | 真实页面刷新、管理页权限和多语言验收                                                                     |
| [migration.test.ts](../../tests/migration.test.ts)                                                | 同步进度字段、正文状态、删除标记表及迁移 up/down                                                                                                          | 部署所用数据库的实际迁移验证                                                                             |

在仓库根目录运行以下定向回归；只选择同步相关文件，不依赖 SMTP 传输测试的本地监听端口：

```bash
pnpm --filter @nocobase/app-plugin-mail exec vitest run tests/sync-recovery.test.ts tests/store-transactions.test.ts tests/mail-runtime.test.ts tests/adapters/gmail/gmail.test.ts tests/adapters/microsoft/microsoft.test.ts tests/adapters/imap-smtp/imap-smtp.test.ts tests/mail-message-content.test.tsx tests/routes.test.ts tests/migration.test.ts --maxWorkers=2
```

真实故障验收按“创建专用测试邮箱 → 记录日期范围和 Provider ID 清单 → 开始同步 → 在指定故障点中断 → 用同一数据库重启 → 等待恢复调度 → 对账”执行。在历史和恢复扫描期间分别注入新增、更新、删除邮件，记录运行 ID、阶段、revision、故障时间及最终唯一邮件数；记录不应包含凭据和原始游标。当前不提供旧版本漏信修复工具，不以修复历史用户数据作为本轮验收前置条件。

### 发送与草稿任务

- [ ] [P0][SRV] MAIL-SEND-SRV-001：Queue job、Outbox 和发送租约恢复 pending、unknown 或超时任务时不产生重复邮件
- [ ] [P1][SRV] MAIL-SEND-SRV-002：发送任务记录 submission 状态、公开错误分类、Provider message ID 和幂等结果
- [ ] [P1][SRV] MAIL-DRAFT-SRV-001：本地草稿创建、更新、发送和删除失败时保留可追踪状态，不产生半成品关系；远端镜像失败不回滚本地草稿
- [ ] [P1][SRV] MAIL-DRAFT-SRV-002：并发编辑、自动保存、发送和删除草稿时最终状态一致，不重复追加签名或附件

## 十、[PROVIDER] Gmail、Microsoft 与 IMAP/SMTP

| 能力           | Gmail                   | Microsoft               | IMAP/SMTP                             |
| -------------- | ----------------------- | ----------------------- | ------------------------------------- |
| 收件和发件     | [ ]                     | [ ]                     | [ ]                                   |
| 初始和增量同步 | [ ] History             | [ ] Graph delta         | [ ] UID/UIDVALIDITY                   |
| Push           | [ ] Pub/Sub watch       | [ ] Graph subscription  | [ ] 不支持                            |
| 文件夹         | [ ] Gmail 系统文件夹    | [ ] Graph folders       | [ ] IMAP mailboxes                    |
| 草稿           | [ ] 本地草稿 + 可选镜像 | [ ] 本地草稿 + 可选镜像 | [ ] 本地草稿，Provider 不提供远端镜像 |
| 移动和删除     | [ ] Trash/永久          | [ ] Trash/永久          | [ ] 按 IMAP/SMTP 能力处理             |
| 原生会话       | [ ] threadId            | [ ] conversationId      | [ ] 不保证                            |
| 别名和身份     | [ ] Send-as             | [ ] Graph identity      | [ ] 主地址和配置别名                  |

- [ ] [P0][PROVIDER] MAIL-GMAIL-001：OAuth PKCE、scope、token 交换、profile、subject、地址和 Send-as 身份同步正确
- [ ] [P0][PROVIDER] MAIL-GMAIL-002：Gmail 历史分页和 History 增量同步正确；History 404 返回游标失效并进入完整范围重扫，不回退为仅查询最近邮件或直接推进 historyId
- [ ] [P1][PROVIDER] MAIL-GMAIL-003：Gmail 系统文件夹、threadId、MIME 正文、纯文本 fallback、签名和附件正确
- [ ] [P1][PROVIDER] MAIL-GMAIL-004：Gmail read、star、move、Trash、永久删除、草稿和 Pub/Sub watch 行为正确
- [ ] [P1][PROVIDER] MAIL-GMAIL-005：Gmail 5xx、超时、认证失败和附件准备失败时账号与 submission 状态正确
- [ ] [P0][PROVIDER] MAIL-GMAIL-006：baseline 取自 mailbox profile 的当前 historyId；最新一封邮件的旧 historyId 不能代替邮箱当前检查点
- [ ] [P0][PROVIDER] MAIL-GMAIL-007：history 分页保留起始 historyId，耗尽后推进；历史 page token 失效进入恢复扫描，日期筛选包含恰好位于 receivedAfter 的邮件
- [ ] [P1][PROVIDER] MAIL-GMAIL-008：单封正文解析失败时用 metadata 保留身份、文件夹和可用头信息，健康邮件继续导入；metadata 请求失败不能跳过该封邮件
- [ ] [P0][PROVIDER] MAIL-MS-001：OAuth offline scope、PKCE、稳定 profile ID、token 轮换、Graph 文件夹树和分页正确
- [ ] [P0][PROVIDER] MAIL-MS-002：Graph delta baseline、增量变化、cursor 过期重建和新增文件夹发现正确
- [ ] [P1][PROVIDER] MAIL-MS-003：Graph 202 无响应体发送、conversation、草稿、回复和转发关系正确
- [ ] [P1][PROVIDER] MAIL-MS-004：小于 3 MB 和大于等于 3 MB 附件分别走正确路径，upload session 续传和 HTTPS 校验正确
- [ ] [P1][PROVIDER] MAIL-MS-005：Graph subscription challenge、clientState、续期、404 重建、认证失败和超时状态正确
- [ ] [P0][PROVIDER] MAIL-MS-006：baseline 尚有 nextLink 时 historyReady 为 false，逐页保存各文件夹检查点；准备完成前不拿未完成 baseline 进入交替追赶，重启后延续 baseline 分页
- [ ] [P0][PROVIDER] MAIL-MS-007：Graph 历史分页或 delta 返回 410 时重新扫描配置日期范围；新增文件夹会建立自己的检查点，不覆盖其他文件夹进度
- [ ] [P1][PROVIDER] MAIL-MS-008：单封正文或附件内容异常时保留可识别邮件记录，正常同页邮件继续导入；请求失败和中止不伪装成成功处理
- [ ] [P0][PROVIDER] MAIL-IMAP-001：IMAP/SMTP endpoint、端口、TLS、rejectUnauthorized 和双端点连接校验正确
- [ ] [P0][PROVIDER] MAIL-IMAP-002：文件夹发现、层级、Sent、Trash、Drafts、UID 分页和 UIDVALIDITY 变化处理正确
- [ ] [P1][PROVIDER] MAIL-IMAP-003：增量同步只读取新的 UID，异常或 malformed cursor 不产生错误数据
- [ ] [P1][PROVIDER] MAIL-IMAP-004：SMTP 普通文本、HTML、回复、转发和附件发送正确，Sent copy 不可用时状态符合定义
- [ ] [P1][PROVIDER] MAIL-IMAP-005：IMAP read、star、永久删除、密码错误、TLS 错误、socket 超时和连接中断状态正确
- [ ] [P0][PROVIDER] MAIL-IMAP-006：初始和增量扫描均检查 UIDVALIDITY；STATUS 与 SELECT 之间世代变化时不得使用旧游标读取新世代 UID，必须进入恢复扫描
- [ ] [P0][PROVIDER] MAIL-IMAP-007：FETCH 乱序、UID 有空洞或某范围无邮件时，完整处理本次有界 UID 范围后再推进，不能用第一封或最后返回一封邮件的 UID 跳过未处理邮件
- [ ] [P1][PROVIDER] MAIL-IMAP-008：历史页恰好结束于文件夹边界、新文件夹出现或连续稀疏范围超过单次扫描预算时，保存后续游标继续处理，不把空页或预算耗尽视为全部完成
- [ ] [P0][PROVIDER] MAIL-IMAP-009：缺少 UIDNEXT 时能推导检查点则继续，无法确定时返回错误；只有真实空邮箱才按空邮箱完成
- [ ] [P0][PROVIDER] MAIL-IMAP-010：receivedAfter 使用收件时间 INTERNALDATE 并包含边界；伪造或更早的 Date 头不导致范围内邮件被跳过
- [ ] [P1][PROVIDER] MAIL-IMAP-011：超过 16 MiB 的背景同步保留 envelope、大小和可取得的附件结构；所有者按需加载完整正文和附件不受背景 16 MiB 截断，UIDVALIDITY 已变化时拒绝读取复用 UID 的另一封邮件
- [ ] [P0][PROVIDER] MAIL-PROVIDER-COMPAT-001：Gmail、Microsoft 和 IMAP/SMTP 的 definition、adapter identity、capabilities、能力方法和 OAuth/credentials 连接方式符合 Mail Core 兼容性契约
- [ ] [P1][DOC] MAIL-PROVIDER-DOC-001：第三方 Provider 开发指南中的目录、注册、能力、凭据、同步、内联附件、错误分类、兼容性测试和发布清单与当前代码一致

## 十一、[DATA] 数据库、迁移与并发一致性

- [ ] [P0][DATA] MAIL-DATA-001：迁移的 up/down 在真实测试数据库中可执行，账号自动同步间隔字段、索引、约束和 metadata 正确
- [ ] [P0][DATA] MAIL-DATA-002：账号、邮件、文件夹、同步、草稿、发送记录、附件、标签和签名关系的外键或级联行为正确
- [ ] [P1][DATA] MAIL-DATA-003：本地标签、邮件标签关联、签名默认值、幂等 key 和活动同步唯一约束正确
- [ ] [P0][DATA] MAIL-DATA-004：并发发送、同步、删除、重新授权和状态切换不会产生重复、孤儿数据或旧状态覆盖新状态
- [ ] [P1][DATA] MAIL-DATA-005：过期附件、OAuth verifier、临时凭据、已完成 Outbox 和失效租约可以被清理
- [ ] [P0][DATA] MAIL-DATA-006：迁移包含 historyStartedAt、historyComplete、recovering、pendingMessages、contentStatus、contentError、size 及相关索引；mailSyncTombstones 的运行与 Provider ID 联合主键、外键和 down 清理顺序正确

## 十二、[NFR] 性能、兼容性、可用性与恢复

- [ ] [P1][NFR] MAIL-NFR-001：桌面端、小屏幕和窄窗口下列表、详情、Composer、账号表单和日志表格可用
- [ ] [P1][NFR] MAIL-NFR-002：大量邮件、多个账号和全部账号视图下列表、分页、筛选和刷新性能可接受
- [ ] [P1][NFR] MAIL-NFR-003：防抖、过期请求、慢响应和响应乱序不会造成持续 loading、明显请求堆积或旧数据覆盖
- [ ] [P1][NFR] MAIL-NFR-004：键盘可以完成账号连接、筛选、打开邮件、发送、关闭 Dialog 和恢复草稿等操作
- [ ] [P1][NFR] MAIL-NFR-005：按钮、输入框、状态徽标、表格列和图标具备可访问名称
- [ ] [P1][NFR] MAIL-NFR-006：刷新、断网、恢复网络、浏览器 focus 和多标签页操作不会产生重复发送
- [ ] [P1][NFR] MAIL-NFR-007：localStorage/sessionStorage 不可用、数据损坏或容量不足时页面仍可浏览并按当前草稿规则处理
- [ ] [P1][NFR] MAIL-NFR-008：不同时区下邮件时间、同步时间和定时发送时间显示与提交正确
- [ ] [P1][NFR] MAIL-NFR-009：未读数量超过 99、没有未读邮件和实时事件连续到达时徽标显示正确
- [ ] [P1][NFR] MAIL-NFR-010：Provider 慢响应、连接超时、浏览器重新打开和进程恢复后页面与任务不会卡死

## 十三、[BOUNDARY] 产品边界与回归确认

- [ ] [BOUNDARY] MAIL-SCOPE-001：当前 Provider 入口只展示 Gmail、Microsoft 和 IMAP/SMTP，不展示 JMAP 或 POP3
- [ ] [BOUNDARY] MAIL-SCOPE-002：Provider Client ID、Client Secret 等部署配置不出现在普通用户设置页面
- [ ] [BOUNDARY] MAIL-SCOPE-003：规则、自动分类、垃圾邮件、钓鱼邮件、AI 总结、分析、翻译和辅助写信不被误认为已实现
- [ ] [BOUNDARY] MAIL-SCOPE-004：管理员共享模板、模板分类、模板搜索和模板排序不超出当前范围
- [ ] [BOUNDARY] MAIL-SCOPE-005：从表格选中业务记录后批量生成邮件收件人不出现在当前邮件列表页
- [ ] [BOUNDARY] MAIL-SCOPE-006：撤回、送达回执、优先级、邮件审计和组织范围等未纳入当前实现的能力不显示入口
- [ ] [BOUNDARY] MAIL-SCOPE-007：组织、部门和成员数据不作为当前邮件插件测试前置条件，等待其他插件接入后再评估
- [ ] [BOUNDARY] MAIL-SCOPE-008：游标失效后重新扫描账号配置范围，包括未受影响的文件夹；不宣称自动清理已超出 Provider 历史保留期的远端删除，也不提供既有漏信数据的专项修复工具

## 十四、执行优先级

- [ ] [P0] 路由权限、账号连接、OAuth、初始和增量同步、邮件列表和详情、单封发送、当前草稿、Provider 隔离和接口安全
- [ ] [P1] Provider 特性、发送幂等、附件、回复转发、定时发送、Push、同步重试、日志、签名、模板和本地标签
- [ ] [P2] 响应式、无障碍、性能、多标签页、浏览器存储异常和多语言校验

## 相关链接

- [邮件插件待实现清单](./pending-implementation.md) — 查看已确认但尚未完成的功能、权限和验收规则
- [邮件插件功能清单](./feature-list.md) — 查看已实现能力、Provider 差异和产品范围
- [邮件插件配置](./configuration.md) — 查看 OAuth、同步、Push 和 IMAP/SMTP 配置
- [@nocobase/app-plugin-mail](../../README.md) — 查看插件概述、运行流程和接口列表
- [client/routes.ts](../../client/routes.ts) — 查看邮件页面路由和权限配置
- [client/pages/mail-workspace-page.tsx](../../client/pages/mail-workspace-page.tsx) — 查看邮件工作台和 Composer 实现
- [client/pages/mail-accounts-dev-page.tsx](../../client/pages/mail-accounts-dev-page.tsx) — 查看账号管理页实现
- [server/routes/api.ts](../../server/routes/api.ts) — 查看邮件 HTTP API 和参数校验
- [server/service.ts](../../server/service.ts) — 查看账号、草稿、同步和邮件操作服务
