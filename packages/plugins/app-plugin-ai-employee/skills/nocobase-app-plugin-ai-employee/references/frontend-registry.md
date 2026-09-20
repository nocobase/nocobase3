# Application AI Registry Guide

## Table of contents

- [Where to edit](#where-to-edit)
- [Provider hierarchy](#provider-hierarchy)
- [Chat surfaces](#chat-surfaces)
- [Service and transport](#service-and-transport)
- [Employees, tasks, and shortcuts](#employees-tasks-and-shortcuts)
- [Page context](#page-context)
- [Forms](#forms)
- [Frontend tools](#frontend-tools)
- [Tool rendering](#tool-rendering)
- [Settings pages](#settings-pages)

## Where to edit

Work in the CLI-created App's installed `client/extensions/nocobase-ai` source. It is App-owned and may be edited and committed for App-specific behavior.

Do not add React UI to `@nocobase/ai-employee`; that dependency is framework-neutral. Do not patch the AI Employee plugin's client package to customize one App.

## Provider hierarchy

Preferred application root:

```tsx
<NocoBaseAIRootProvider
  service={nocobaseAIService}
  toolRenderers={applicationToolRenderers}
>
  <YourApplication />
</NocoBaseAIRootProvider>
```

It composes `AIProvider`, `AIToolRendererProvider`, and `AIPageElementProvider` in the required order. `NocoBaseAIExtensionProvider` adds the global side-panel/floating chat entry and is appropriate at extension/application level.

Use lower-level providers only for an advanced integration that deliberately replaces one layer. Keep the existing provider ordering.

`NocoBaseAIRootProvider` starts employee/model discovery asynchronously; it does not defer mounting its children. A chat initialized before discovery may display fallback defaults while its internal selection and transport still reflect the empty configuration. Gate the entire `AIChatProvider` subtree with a child component that reads `useAI()` under the root, not merely the composer or a loading overlay. Require `configurationStatus === 'ready'`, nonempty `employees`, and `hasEnabledModels` before mounting it.

Show a loading status while discovery runs, an actionable alert for `configurationStatus === 'error'` / `configurationError`, and a separate alert for `modelConfigurationError` or missing enabled models. `configurationStatus` can be `'ready'` when model discovery fails, and `models` can contain a `configured: false` placeholder; neither status nor array length alone proves the chat can send. Do not supply preview employees/models to make a production composer appear ready.

## Chat surfaces

Mount each conversation scene in one `AIChatProvider` with a stable id and, when needed, a dedicated controller, but only after configuration is usable. This complete minimal page uses the same readiness gate as the Skill's Frontend App Integration example:

```tsx
import {
  AIChatProvider,
  AIChatWindow,
  ChatInline,
  NocoBaseAIRootProvider,
  nocobaseAIService,
  useAI,
  useAIChatController,
} from '@/extensions/nocobase-ai';

function ConfiguredChat() {
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();
  const controller = useAIChatController();

  if (configurationStatus === 'loading') {
    return <p role='status'>Loading AI configuration...</p>;
  }
  if (configurationStatus === 'error') {
    return (
      <p role='alert'>
        {configurationError?.message ?? 'Unable to load AI configuration.'}{' '}
        Check your connection, employee access, and AI settings, then reload
        this page.
      </p>
    );
  }
  if (!employees.length) {
    return <p role='alert'>No AI employees are available for this user.</p>;
  }
  if (modelConfigurationError) {
    return (
      <p role='alert'>
        {modelConfigurationError.message} Check and enable a model in AI
        settings, then reload this page.
      </p>
    );
  }
  if (!hasEnabledModels) {
    return (
      <p role='alert'>
        No enabled AI model is available. Configure and enable a model in AI
        settings, then reload this page.
      </p>
    );
  }

  return (
    <AIChatProvider id='sales-chat' controller={controller}>
      <ChatInline>
        <AIChatWindow />
      </ChatInline>
    </AIChatProvider>
  );
}

export default function SalesChatPage() {
  return (
    <NocoBaseAIRootProvider service={nocobaseAIService}>
      <ConfiguredChat />
    </NocoBaseAIRootProvider>
  );
}
```

Use the App's actual extension import alias and localize these messages. If a root AI provider already wraps the route, mount `ConfiguredChat` under it without nesting another root. Keep the controller hook unconditional and its identity stable. Do not key the chat by an employee or model merely to force initialization; that discards conversation state.

Available surfaces include `ChatInline`, `ChatPage`, `ChatDialog`, `ChatSidePanel`, and the variant-switching `ChatSurface`. For a chat that expands from side panel to dialog, change `ChatSurface.variant` rather than remounting the chat; this preserves messages, composer, scroll, and tool state.

### First-send acceptance checks

- Open the page with discovery requests delayed. A loading status must be visible and the chat must not mount or offer a send action until both employee and model discovery finish.
- Once ready, keep the displayed default employee and model unchanged, enter text, and send. Verify conversation creation and the message stream request use those defaults, the draft clears, and the message appears.
- Reload the page and repeat the first send without switching employees or models. Test a fresh mount, not only a page whose chat was previously initialized.
- Simulate employee discovery failure, no accessible employees, model discovery failure, and no enabled models (including an unconfigured placeholder). Each must show an actionable alert instead of an apparently usable composer. After fixing configuration and reloading, first send must work.
- Use the existing service/transport for these checks; a mocked composer callback alone cannot prove conversation creation or sending works.

## Service and transport

`AIService` is defined in `services/types.ts`. `NocoBaseAIService` is the application adapter for the enabled plugin's `/api/ai` routes. It supplies employees/models, conversations/history, file upload, send/resend/resume streams, decisions, and reconnect.

`NocoBaseChatTransport` constructs requests and maps SSE into AI SDK UI messages. Reuse it through `AIProvider.createTransport`. Do not implement a second page-level stream parser.

Override `AIService` only when the application uses a genuinely different backend. A replacement must preserve the complete service contract; otherwise history, active-state recovery, decisions, or resume will break.

## Employees, tasks, and shortcuts

Employees returned by the service include package built-ins plus accessible application-defined employees. Select them by registered `username`; do not import employee definition modules into browser code.

`AIEmployeeTask` may include title, system/user message, work context, auto-send, skill settings, web search, and model selection.

- Use `AIChatProvider.employeeTasks` for empty-state task presets.
- Use `AIEmployeeShortcut` for actions outside the chat.
- Keep the shortcut and chat on the same controller.
- Use `autoSend: false` when the user should review context or a generated request.
- Explicit `task.message.workContext` overrides trigger context and surrounding scope.

## Page context

Register visible business UI with `useAIPageElementHandle`:

```tsx
const customer = useAIPageElementHandle({
  id: 'customer-detail',
  title: 'Customer detail',
  getContext: () => ({ customer: currentCustomer }),
});

return (
  <AIPageContextScope context={customer.context}>
    <section ref={customer.ref}>...</section>
  </AIPageContextScope>
);
```

`getContext` runs immediately before selection/send, so return the latest values. Context must be structured-clone/JSON serializable. Do not send DOM nodes, callbacks, React/form instances, secrets, cyclic objects, or unbounded records.

Use `AIPageContextScope` for inherited context, `mode='append'` to compose parent/child scope, `createAIPageContextReference` for stable references, and `useAIPageElementPicker` for manual selection. Resolution failures block sending by default; use `contextFailurePolicy='omit'` only when sending without context is an intentional product behavior.

## Forms

Register forms with `useAIForm`:

```tsx
const formRef = useAIForm({
  id: 'lead-form',
  title: 'Lead form',
  fields: [
    { name: 'name', type: 'string', required: true },
    { name: 'status', type: 'string', enum: ['new', 'qualified'] },
  ],
  getValues: () => form.getValues(),
  setValues: (values) => applyReactHookFormValues(form, values),
});
```

Attach the ref to the visible form. Sending its context automatically activates the built-in `formFiller`; do not add a duplicate application tool or manually add it to task skill settings.

The runtime accepts only declared, editable, type/enum-compatible fields. It reports applied/skipped fields and never submits or saves the form. Submission remains an explicit application/user action.

## Frontend tools

Frontend tools are page-local browser actions, separate from application backend `defineTools()` resources:

```tsx
const quote = useAIPageElementHandle({
  id: 'quote-editor',
  title: 'Quote editor',
  getContext: () => ({ draft }),
  tools: [
    defineAIFrontendTool({
      name: 'applyDiscount',
      title: 'Apply discount',
      description: 'Change the visible draft discount.',
      permission: 'ASK',
      inputSchema: {
        type: 'object',
        properties: { percent: { type: 'number' } },
        required: ['percent'],
      },
      execute: async ({ percent }) => {
        setDiscount(percent);
        return { status: 'success', content: { percent } };
      },
    }),
  ],
});
```

The runtime id is `${contextId}:${name}`. Page context sends an allowlisted manifest. The agent uses built-in `loadFrontendTool` then `executeFrontendTool`; browser execution occurs only for an exact allowed id. Results must be serializable.

Use `ALLOW` only for harmless, reversible local UI changes. Use `ASK` for persistence, business mutations, side-effecting navigation, or anything the user would reasonably expect to confirm. Prompts do not replace runtime permission.

## Tool rendering

Pass application-specific renderers through `NocoBaseAIRootProvider.toolRenderers`. Built-in Registry renderers cover suggestions, charts/ECharts, workflow, sub-agents, and business reports.

A renderer controls presentation only. It must preserve invocation status, approval/edit/reject actions, resume behavior, and disabled state.

## Settings pages

Contribute independent sidebar entries with `defineSettingsRoutes()` and `parent: 'aiGroup'`, registering the result through the contributing plugin's client `routes`. Use a unique name and path, a lazy default-exported component, translated navigation, and an explicit access policy. See the [AI Settings example](../SKILL.md#adding-ai-settings-pages).

AI Employees at `/settings/ai` is employee-only. `AISettingsShell` and `withAISettingsShell` remain exported as tab-free employee layout wrappers; use feature-owned headings for independent pages. The deprecated tab registry no longer contributes visible navigation or page content. Built-in legacy service and knowledge-base tab URLs redirect to standalone routes, preserving unrelated queries and hashes; custom tab integrations must declare their own migration routes.
