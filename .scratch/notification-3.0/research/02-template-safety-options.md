# Node.js 通知模板安全与 HTML 清洗方案研究

研究日期：2026-08-17

## 结论摘要

没有一个模板包能同时替代模板语义校验、HTML 清洗和运行时隔离。应把问题拆成三层：

1. **模板语言层**：限制作者能表达的能力，并对未知变量失败；
2. **输出层**：变量默认 HTML 转义，完整 HTML 在渲染后按渠道策略再次清洗；
3. **执行层**：限制模板/输出大小、时间和资源；若模板作者不完全可信，使用进程或容器边界。

在所核验的方案中，形成三个可继续评估、但尚未替用户选定的组合族：

- **LiquidJS 10.27.2+ + sanitizer + 进程/容器限制**：模板语言原生具备变量、条件、循环、严格变量/过滤器、默认输出转义选项、原型访问收窄和协作式 DoS 限制；安全开关较齐全，但 2026 年出现过已修复的模板 RCE，且官方明确其内置限制不是沙箱。
- **Handlebars 4.7.9+ + sanitizer + 外部资源限制**：变量、`if`、`each`、`strict` 与默认 HTML 转义成熟；需要更严格地管理 helper、禁止原型访问放宽，并自行补模板大小/渲染资源限制。
- **上述任一模板引擎 + `sanitize-html` / DOMPurify+jsdom / rehype-sanitize**：三个 sanitizer 的解析模型、Node 版本下限和策略维护成本不同，不能只凭“默认安全”互换。

Nunjucks 官方明确说它不对执行做沙箱，运行用户定义模板会暴露敏感数据访问和服务端 RCE，因此不进入“不可信作者”候选；Mustache 会把未知变量渲染为空字符串，不能直接满足严格未知变量要求。

## 范围与威胁模型

本研究只采用模板库、sanitizer、Node.js 的官方文档、官方仓库及仓库自身配置。评估对象分为两种攻击面：

- **不可信数据**：通知变量可能含 HTML、URL 或属性边界字符。
- **不可信或半可信模板作者**：租户管理员或集成方可能提交模板语法、raw 输出、循环、partial 或 helper/tag/filter 调用。

这两者不能混为一谈。模板引擎的自动转义主要约束插值数据；模板正文自己写入的 `<script>`、事件属性、危险 URL、raw 输出，以及耗时循环，仍要由发布校验、最终 HTML 清洗和资源边界处理。Handlebars 也明确说明其 HTML 转义不适用于 JavaScript 字符串/内联事件处理器。[Handlebars HTML escaping](https://handlebarsjs.com/guide/#html-escaping)

## 模板引擎对比

| 方案 | 变量 | 条件 | 循环 | 未知变量严格失败 | HTML 转义 | 服务端安全边界 | 维护证据（截至研究日） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LiquidJS | 是 | `if`/`elsif`/`case` | `for` | `strictVariables`; 另有 `strictFilters` | `outputEscape: "escape"`，可被 `raw` 绕过 | 非沙箱；有 `parseLimit`/`renderLimit`/`memoryLimit`，但均为协作式 | 最新 release 为 10.27.2（2026-07-09） |
| Handlebars | 是 | 内建 `if`/`unless` | 内建 `each` | 编译选项 `strict` | `{{...}}` 默认转义，`{{{...}}}`/`SafeString` 绕过 | 非隔离边界；helper 是宿主函数；需外部资源限制 | 最新 release 为 4.7.9（2026-03-26） |
| Nunjucks | 是 | 是 | 是 | `throwOnUndefined` | `autoescape` 默认 true | 官方明确“不 sandbox”，不安全运行用户定义模板 | 即使功能满足，也因官方安全声明排除不可信作者场景 |
| Mustache.js | 是 | section 表达真假分支 | section 可迭代列表 | **否**，缺失 key 不输出任何内容 | 默认转义，triple mustache/raw 绕过 | 逻辑较小，但函数值/section lambda 会调用宿主代码 | 最新 release 4.2.0；严格变量 issue 仍未成为标准能力 |

### LiquidJS

能力事实：

- 官方标签总览列出控制流 `if`/`unless`/`elsif`/`else`/`case`，以及迭代 `for`/`cycle`/`tablerow`。[LiquidJS tags](https://liquidjs.com/tags/overview.html)
- `strictVariables: true` 使未定义变量在渲染时抛错；`strictFilters: true` 使未知过滤器在解析时抛错。`lenientIf` 会允许条件或 `default` 前的未知变量，因此若票据要求“严格未知变量”，应显式保持 `lenientIf: false`。[LiquidJS options](https://liquidjs.com/tutorials/options.html#strict)
- `outputEscape: "escape"` 对输出变量默认做 HTML 转义，作者仍可显式使用 `raw`。[LiquidJS escaping](https://liquidjs.com/tutorials/escaping.html)
- `parseLimit` 限制单次解析的模板总长度，`renderLimit` 限制渲染时间检查，`memoryLimit` 只计算 LiquidJS 明确记账的分配。[LiquidOptions API](https://liquidjs.com/api/interfaces/LiquidOptions.html)
- 静态分析 API 可列出全局变量及完整路径，并能分析静态 partial；动态 partial 名称会被忽略，而且该 API 标为 experimental。它适合发布时生成“模板依赖变量清单”，但不能替代运行时严格校验。[LiquidJS static analysis](https://liquidjs.com/tutorials/static-analysis.html)

安全限制：

- 官方安全模型明确：三类限制不等同于进程 RSS/heap 限制、不 sandbox JavaScript；`renderLimit` 在模板片段之间检查，重型 filter/tag/宿主函数仍可造成 DoS；在线服务若必须运行用户定义模板，应组合 worker/process/container、OS/container CPU/内存限制和请求限流。[LiquidJS security model](https://liquidjs.com/tutorials/security-model.html)
- `ownPropertyOnly` 只约束 scope 读取，不约束 filter、tag 或自定义 `Drop`；`Drop` 仍可能读取原型链或调用 `liquidMethodMissing`。[LiquidJS security model](https://liquidjs.com/tutorials/security-model.html#ownpropertyonly-and-scope-data)
- 截至研究日，官方两个同日更新页面对 `ownPropertyOnly` 的默认值描述冲突：options 页面说默认 `true`，security model 页面说默认 `false`。因此实现不能依赖默认值，应显式设为 `true` 并用版本固定测试验证。[Options](https://liquidjs.com/tutorials/options.html#strict)；[Security model](https://liquidjs.com/tutorials/security-model.html#ownpropertyonly-and-scope-data)
- 10.26.0 之前存在 crafted template RCE，官方 advisory 将 10.26.0 标为修复版本；最新 release 10.27.2 还继续修复资源记账和继承数组索引问题。候选基线不应低于 10.27.2。[GHSA-gf2q-c269-pqgc](https://github.com/advisories/GHSA-gf2q-c269-pqgc)；[LiquidJS 10.27.2](https://github.com/harttle/liquidjs/releases/tag/v10.27.2)

若继续验证此候选，建议固定而非依赖默认值的选项集合为：`strictVariables: true`、`strictFilters: true`、`lenientIf: false`、`ownPropertyOnly: true`、`outputEscape: "escape"`，再按基准测试确定非空的 `parseLimit`、`renderLimit`、`memoryLimit`。同时关闭或改造成内存映射的 partial/layout 文件查找，限制可注册 filter/tag，不向 scope 放函数或特权 `Drop`。

### Handlebars

能力事实：

- 内建 helper 提供 `if`、`unless` 和 `each`。[Handlebars built-in helpers](https://handlebarsjs.com/guide/builtin-helpers.html)
- `strict: true` 时缺失字段抛错而不是静默忽略；副作用是 inverse expression 只有在字段显式存在时才能工作。[Handlebars compilation API](https://handlebarsjs.com/api-reference/compilation.html)
- 普通 `{{expression}}` 默认 HTML 转义；triple-stash、`SafeString` 或错误编写的 helper 可绕过。官方还特别警告这不是 JavaScript 字符串的上下文转义。[Handlebars guide](https://handlebarsjs.com/guide/#html-escaping)

安全限制：

- 默认禁止上下文对象的原型属性/方法访问；官方说明放宽这些开关可能使模板作者执行任意代码或让机器崩溃。不要使用 `@handlebars/allow-prototype-access`，也不要设置任何 `allowProto*ByDefault: true`。[Handlebars runtime options](https://handlebarsjs.com/api-reference/runtime-options.html#options-to-control-prototype-access)
- `allowCallsToHelperMissing: true` 被官方直接标为 insecure，并说明可造成 RCE，必须保持关闭。[Handlebars runtime options](https://handlebarsjs.com/api-reference/runtime-options.html)
- helper 是应用注册并在渲染时传入的宿主函数；因此“模板语法受限”不代表 helper 安全。应使用独立 Handlebars 实例，只注册无 I/O、无反射、输入输出有界的 allowlist helper，并在编译时显式列出 known helpers。[Handlebars guide: custom helpers](https://handlebarsjs.com/guide/#custom-helpers)；[compilation options](https://handlebarsjs.com/api-reference/compilation.html)
- 4.7.8 及以下存在 AST type confusion 导致的 JavaScript 注入；官方 advisory 标记 4.7.9 修复，并建议调用 `compile()` 前强制输入必须是 string，不能把 JSON 反序列化对象当 AST 传入。候选基线应为 4.7.9+ 并保留输入类型断言。[GHSA-2w6w-674q-4c4q](https://github.com/advisories/GHSA-2w6w-674q-4c4q)；[Handlebars 4.7.9](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.9)

相较 LiquidJS，Handlebars 官方接口没有同类的解析长度、渲染时间和内存记账选项，所以发布/执行服务必须自行施加模板长度、嵌套深度、输出大小、超时和进程资源限制。若模板在发布后固定，可预编译并仅部署 runtime build；官方 advisory 也把 runtime-only build 列为避免服务端 `compile()` 攻击面的办法之一。[Handlebars advisory](https://github.com/advisories/GHSA-2w6w-674q-4c4q)

### 不进入“不可信模板作者”候选的常见方案

- **Nunjucks**：虽然提供变量、`if`、`for`、`throwOnUndefined` 和默认 `autoescape`，官方文档明确写明它“不 sandbox execution”，服务端运行用户定义模板可能暴露敏感数据访问和 RCE。因此只可考虑由受信开发者维护、构建期固定的模板，不满足本票据的服务端不可信执行边界。[Nunjucks templating warning](https://mozilla.github.io/nunjucks/templating.html#user-defined-templates-warning)；[Nunjucks API](https://mozilla.github.io/nunjucks/api.html)
- **Mustache.js**：官方 README 明确缺失 key 时“不渲染任何内容”，且语言没有直接的 if/else/for，只靠 sections 表达真假和列表；其严格变量请求 issue 长期仍为 open。因此不能原生满足“严格未知变量校验”。另外 view 中的函数与 section lambda 会被调用，传入 context 时仍需禁止函数值。[Mustache.js README](https://github.com/janl/mustache.js#variables)；[strict variable issue #599](https://github.com/janl/mustache.js/issues/599)

## HTML sanitizer 对比

模板变量的自动转义和完整 HTML 清洗是叠加关系，不是二选一。若通知允许模板作者编写 HTML 或使用 raw 输出，安全顺序应是：**解析/发布校验 → 严格渲染并默认转义变量 → 对最终 HTML 片段执行渠道专属 allowlist 清洗 → 大小限制 → 发送**。

| 方案 | 模型 | 优点 | 主要成本/边界 | 当前维护与版本事实 |
| --- | --- | --- | --- | --- |
| `sanitize-html` | `htmlparser2` + 标签/属性/协议 allowlist | Node 优先、无 DOM；邮件标签/属性策略直观；支持 URL scheme、style/class 策略 | 当前版要求 Node >=22.12；错误放宽 SVG/MathML/raw-text/style 会扩大攻击面 | 已迁入 Apostrophe monorepo；2.17.7 于 2026-08-13 修复 XSS 绕过 |
| DOMPurify + jsdom | DOM 解析 + allowlist/namespace 防护 | 以浏览器 DOM 语义清理，mXSS/namespace 威胁模型完整；支持 `USE_PROFILES: {html: true}` | jsdom 成为 TCB；必须持续升级；依赖较重；不能启用脚本执行 | DOMPurify 3.4.13（2026-08-03）；jsdom 30.0.1（2026-07-29） |
| rehype-sanitize | parse → HAST → schema sanitize → stringify | ESM、TypeScript 生态；默认 GitHub 风格 schema；Node 16+；显式处理 DOM clobbering | 多包 AST pipeline；邮件 HTML/style 策略需较多 schema 工作；稳定 release 6.0.0 较老 | unified 集体声明当前 release line 兼容维护中的 Node 版本 |

### `sanitize-html`

- 原独立仓库在 2026-02-26 archive 是因为代码迁入 Apostrophe monorepo，并非停止维护；monorepo 当前包版本为 2.17.7。[迁移说明](https://github.com/apostrophecms/sanitize-html)；[当前 package.json](https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/package.json)
- 它允许显式配置标签、逐标签属性、URL schemes、iframe host、CSS class/style。官方建议服务端使用，并警告改变底层 parser 配置会有安全风险，安全目标下应保留默认解析设置。[sanitize-html README](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html)
- 2.17.7/2.17.6 刚修复 SVG animation URL scheme、SVG/MathML raw-text 与 mutation-XSS 绕过；默认策略未触发部分问题，但这证明自定义 allowlist 必须尽量小并以真实浏览器回归测试。[sanitize-html changelog](https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/CHANGELOG.md)
- 2.17.7 的 `engines.node` 为 `>=22.12.0`。仓库根当前只声明 Node `>=20`，若选择最新版，需要同步决定是否抬升运行时下限，而不是降级到带已知修复缺口的旧 sanitizer。[上游 package.json](https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/package.json)；[本仓库 package.json](../../../package.json)

### DOMPurify + jsdom

- DOMPurify 默认清除可导致 XSS 的 HTML/SVG/MathML，纯 HTML 通知可收窄到 `USE_PROFILES: { html: true }`；清洗后再修改标记可能使清洗失效。[DOMPurify README](https://github.com/cure53/DOMPurify#what-does-it-do)
- 服务端必须提供 DOM。官方强烈建议使用最新 jsdom，因为旧 jsdom 的解析 bug 可在 DOMPurify 自身正确时仍导致 XSS；happy-dom 当前不被认为安全。[DOMPurify server-side guidance](https://github.com/cure53/DOMPurify#running-dompurify-on-the-server)
- DOMPurify 的官方威胁模型把服务端 DOM 明确列为 TCB；HTML-only 应避免不需要的 SVG/MathML、`style`、`template` 等扩展面。[DOMPurify threat model](https://github.com/cure53/DOMPurify/wiki/Security-Goals-%26-Threat-Model)
- jsdom 默认不执行脚本；其官方文档警告 `runScripts: "dangerously"` 面对任意用户 HTML 等价于运行不可信 Node.js 代码。sanitizer 实例不得启用它，也不得加载外部资源。[jsdom executing scripts](https://github.com/jsdom/jsdom#executing-scripts)
- 最新 DOMPurify release 为 3.4.13；最新 jsdom 为 30.0.1。jsdom 30.0.1 的 Node 要求为 `^22.22.2 || ^24.15.0 || >=26.0.0`，比本仓库 `>=20` 更窄。仓库的 app-template 和 hub 已声明 `jsdom: ^30.0.1`，但通知服务是否能复用其实例、以及部署 Node 下限是否一致，仍需单独验证。[DOMPurify releases](https://github.com/cure53/DOMPurify/releases/tag/3.4.13)；[jsdom 30.0.1](https://github.com/jsdom/jsdom/releases/tag/v30.0.1)；[jsdom engines](https://github.com/jsdom/jsdom/blob/main/package.json)；[app-template package](../../../packages/app-template-default/package.json)；[hub package](../../../packages/hub/package.json)

### rehype-sanitize

- 该插件把 HTML 解析为 HAST，删除 schema 未明确允许的内容；默认 schema 采用 GitHub 风格，并显式处理协议与 DOM clobbering。官方建议对任何不完全可信的作者或插件输出使用，并要求把 sanitizer 放在最后一个不可信转换之后。[rehype-sanitize README](https://github.com/rehypejs/rehype-sanitize)
- 当前 6.x 为 ESM-only、Node 16+，与仓库 Node `>=20` 基线兼容；但需要 `unified`、`rehype-parse`、`rehype-stringify` 等 pipeline，且仓库当前没有这些依赖。若未来通知内容本来就进入 rehype/Markdown AST 管线，它的组合成本会下降；若只清洗 HTML 字符串，则成本高于前两者。[rehype-sanitize compatibility](https://github.com/rehypejs/rehype-sanitize#compatibility)

## Node.js 执行安全机制能做什么

### 不能作为沙箱的机制

- `node:vm` 官方原文明确：“not a security mechanism”，不得用于运行不可信代码。即使设置 timeout，也不能把 EJS/Pug/任意 JavaScript 模板安全化。[Node.js `vm`](https://nodejs.org/api/vm.html)
- Node Permission Model 是防止受信代码误操作的“seat belt”，官方明确恶意代码可绕过；它不提供恶意代码下的安全保证。它可作为独立渲染进程的纵深防御，但不是模板沙箱。[Node.js permissions](https://nodejs.org/api/permissions.html)
- Worker thread 可共享内存；其 `resourceLimits` 只影响 V8 engine，不包含外部数据/`ArrayBuffer`，全局 OOM 仍可能使进程退出。因此 worker 适合超时取消和吞吐隔离，不足以保护主进程免受恶意模板或 native/heap 崩溃。[Node.js worker threads](https://nodejs.org/api/worker_threads.html)

### 可作为纵深防御的进程边界

`child_process.fork()` 会启动独立 Node.js 进程并提供 IPC；`spawn`/`fork` 支持 timeout/AbortSignal，输出可设上限。执行固定的渲染入口时，应避免 shell，传入结构化 IPC 数据，使用最小环境变量和工作目录，超时后终止整个渲染进程，并由 OS/container 设置 CPU、内存、文件系统、网络和用户身份边界。[Node.js child process](https://nodejs.org/api/child_process.html)

Node 官方也提示：同一 OS 用户下的进程仍可能通过 inspector 信号互相影响；若把渲染器当真正的不可信执行面，应使用不同 OS 用户或 OS 级隔离，而不只是 `--permission`。[Permission Model constraints](https://nodejs.org/api/permissions.html#permission-model-constraints)

## 候选组合及组合成本（不做最终选型）

### 组合 A：LiquidJS + `sanitize-html` + 隔离渲染进程

适合继续验证的事实：严格变量/过滤器、控制流、循环、输出转义、静态变量分析和协作式 DoS 限制集中在一个模板库；`sanitize-html` 的邮件标签/属性/协议 allowlist 直观，且无 DOM TCB。

需要接受的成本：至少把实际渲染进程提升到 Node 22.12；维护两套策略（模板语法 allowlist + HTML allowlist）；固定 LiquidJS 10.27.2+ 并跟进安全公告；为 filter/tag、partial、输出和进程另加限制。

### 组合 B：LiquidJS + DOMPurify/jsdom + 隔离渲染进程

适合继续验证的事实：模板安全开关同组合 A；DOMPurify 的 DOM/namespace/mXSS 威胁模型更贴近浏览器最终解析，并可收窄为 HTML profile；仓库已有 jsdom 依赖声明。

需要接受的成本：最新 jsdom 的 Node floor 更高（22.22.2/24.15/26）；DOMPurify 与 jsdom 都成为需要快速安全升级的 TCB；每个渲染 worker/process 初始化 DOM 的性能与内存成本需基准测试；必须禁止 jsdom 脚本执行和资源加载。

### 组合 C：Handlebars + `sanitize-html` 或 DOMPurify/jsdom + 隔离渲染进程

适合继续验证的事实：语法和作者体验常见，`strict`、`if`、`each` 与默认 HTML 转义直接满足基本能力；4.7.9 已修复当年的 critical advisories。

需要接受的成本：自行实现模板长度/复杂度/时间/输出限制；helper allowlist 的审计面比 Liquid 内建 filter/tag 策略更显著；必须对 `compile()` 输入做 string 断言、关闭 helperMissing 与所有原型访问放宽。sanitizer 的 Node/TCB 成本分别同 A/B。

### 组合 D：LiquidJS 或 Handlebars + rehype-sanitize + 隔离渲染进程

适合继续验证的事实：保持 Node 20 基线，schema 明确且适合未来统一 Markdown/HTML AST 管线。

需要接受的成本：当前仓库没有 unified/rehype 依赖；引入 parse/sanitize/stringify 多包管线；邮件客户端需要的 table、style/class 等策略会偏离默认 GitHub schema，策略设计和回归测试工作较多。

## 所有候选都应满足的验证清单

1. 发布时拒绝非 string 模板、超长模板、过深嵌套、未知 tag/filter/helper/partial 和动态文件路径；保存解析后的依赖变量清单。
2. 渲染时未知变量必须失败；可选字段用显式 `null`/默认值契约表达，不通过关闭 strict 或开启 `lenientIf` 隐藏拼写错误。
3. context 只包含 JSON-like own properties；不传函数、class instance、ORM model、request、process、logger、数据库 client 或其他特权对象。
4. 禁止或严格审计 raw 输出；即使保留 raw，也必须对最终 HTML 清洗。
5. sanitizer 使用按渠道版本化的最小 allowlist；默认禁止 script、事件属性、危险 URL scheme、iframe、SVG/MathML、`style`/`template`，只有明确产品需求和浏览器/邮件客户端测试后逐项放行。
6. 对模板字节数、变量对象大小、循环集合长度、partial 深度、渲染时间、最终输出字节数和并发数分别设限。
7. 不使用 `node:vm` 作为安全承诺；半可信作者至少进入可终止的独立进程，不可信多租户作者再加不同 OS 用户或容器的 CPU/内存/网络/文件系统边界。
8. 固定最小安全版本并自动监控 advisories；用真实浏览器和目标邮件客户端回归 sanitizer 自定义策略，特别覆盖 raw-text、URL、SVG/MathML、DOM clobbering 和 mutation-XSS 用例。

## 仍需产品/架构决策的问题

- 模板作者是平台开发者、站点管理员，还是任意租户管理员？这决定进程还是容器边界。
- 通知 HTML 是否必须允许 raw HTML、inline style、图片、链接、表格或 iframe？这决定 sanitizer，而不是模板引擎本身。
- 是否可把运行时基线从 Node 20 提升到 Node 22.12 或 22.22.2+？这会直接排除或增加 sanitizer 组合成本。
- 是否接受“所有引用变量都必须存在”，还是希望条件中的可选变量不报错？后者会削弱严格未知变量发现能力，应通过数据 schema/显式 null 设计解决。
- 模板是否发布后不可变并可预编译？若是，Handlebars runtime-only 的攻击面和运行成本会明显下降。

上述问题回答前，本报告只提供候选组合与事实边界，不替用户做最终选型。
