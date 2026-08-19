# 选择安全模板渲染与 HTML 清洗方案

Type: research
Status: resolved
Resolution: out-of-scope-after-scope-reduction

## Question

在 Node.js 运行时中，哪些有维护的第一方模板与 HTML 清洗方案能够满足变量、条件、循环、严格未知变量校验、HTML 转义/清洗和服务端执行安全要求；它们的能力、限制与组合成本是什么？

## Answer

研究确认没有单包同时提供模板语义、最终 HTML 安全与不可信执行隔离。可继续评估的组合族是 LiquidJS 10.27.2+ 或 Handlebars 4.7.9+，叠加 `sanitize-html` 2.17.7、DOMPurify 3.4.13 + 最新 jsdom，或 rehype-sanitize，并在模板作者不完全可信时使用独立进程/容器资源边界。LiquidJS 原生安全/DoS 开关较齐，Handlebars 的 helper 与资源限制需更多宿主治理；不同 sanitizer 的 Node 下限和 TCB 成本明显不同。Nunjucks 官方明确不安全运行用户定义模板，Mustache.js 不支持严格未知变量失败。Node `vm` 与 Permission Model 均不是恶意代码沙箱。

完整事实、逐项一手引用、能力矩阵、候选组合成本和待决问题见[研究报告](../research/02-template-safety-options.md)。本票据不替用户做最终选型。

后续范围再次调整后，本期恢复了开发者注册的内部模板与逐 Recipient 渲染，并在 Trigger 契约中复用了本报告的 LiquidJS 与 HTML 清洗事实；面向业务用户或管理员的可编辑模板、不可信模板作者执行边界和完整模板管理平台仍不属于本期。本票据继续作为范围外研究资料保留，实际内部模板决策记录在 Trigger 契约中。
