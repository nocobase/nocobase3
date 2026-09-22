---
'@nocobase/app-plugin-ai-employee': patch
---

Let the AI employee context provider depend on the manager that owns model policy

`AIEmployeeAgentContextProviderOptions.resolveModel` was a closure, and `AgentServiceFactory` built it by binding the employee to `aiEmployeesManager.resolveModel`. The provider already holds that employee and already depends on four other managers directly, so the closure was a wrapper around a manager the provider could simply be given: it hid which component owns the policy, and it left the provider unable to reach anything else on that manager without another callback beside it.

The option is `aiEmployeesManager: AIEmployeesManager`, and `resolveLLM()` calls `resolveModel(this.employee, …)` itself. The employee's configuration still decides the model, and a request still may ask for one without widening what the employee allows; only the route to the code that enforces it is direct.
