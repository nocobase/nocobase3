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
- [Settings tabs](#settings-tabs)

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

## Chat surfaces

Wrap each conversation scene in one `AIChatProvider` with a stable id and, when needed, a dedicated controller:

```tsx
const controller = useAIChatController();

return (
  <AIChatProvider id='customer-assistant' controller={controller}>
    <ChatInline>
      <AIChatWindow />
    </ChatInline>
  </AIChatProvider>
);
```

Available surfaces include `ChatInline`, `ChatPage`, `ChatDialog`, `ChatSidePanel`, and the variant-switching `ChatSurface`. For a chat that expands from side panel to dialog, change `ChatSurface.variant` rather than remounting the chat; this preserves messages, composer, scroll, and tool state.

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

## Settings tabs

A contributing application plugin can extend the shared AI settings shell through the public client export:

```ts
import { registerAISettingsTabs } from '@nocobase/app-plugin-ai-employee/client/ai-settings';

registerAISettingsTabs([
  {
    key: 'application-ai',
    labelKey: 'Application AI',
    pageLoader: () => import('./pages/application-ai-settings.js'),
  },
]);
```

Register during module evaluation and side-effect import the registration module from the contributing plugin client entry. The page loader must default-export a React component. Add translations for `labelKey`. Keep the shared route `/settings/ai` and use a unique key.

An enabled knowledge-base App plugin is the canonical example: its client registration module calls `registerAISettingsTabs` and is imported for side effects from the plugin client entry.
