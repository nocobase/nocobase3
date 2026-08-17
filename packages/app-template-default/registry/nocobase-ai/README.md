# NocoBase AI Registry

The Registry is split by capability so applications only install the code and dependencies they use.

These entries target the compatible NocoBase admin starter family. The host must
provide the `@` source alias, `@nocobase/portal-sdk/client`, the standard shadcn
UI components, and (for `@nocobase/ai`) the
`@nocobase/portal-sdk/extensions` discovery contract.
Applications with a different host can still reuse the providers and components,
but should supply their own `AIService` adapter and integration entry.

- `@nocobase/ai-runtime`: NocoBase service adapter, chat state, streaming transport, conversation history, Tool execution, and page-context registries.
- `@nocobase/ai-chat`: Chat windows, containers, triggers, page-element APIs, built-in Tool cards, and the high-level `NocoBaseAIRootProvider`.
- `@nocobase/ai-react-hook-form`: Optional React Hook Form adapter for the built-in Form filler.
- `@nocobase/ai`: The complete Demo extension and routes.

## Recommended provider

Use one root provider around every chat surface and page element that should participate in AI interactions:

```tsx
<NocoBaseAIRootProvider service={service}>
  <YourApplication />
</NocoBaseAIRootProvider>
```

It installs the AI runtime, built-in Tool renderers, Form registry, frontend Tool registry, and page-context resolver in the required order. The lower-level providers remain available for advanced integrations.

## Page context

Prefer `useAIPageElementHandle` when a page element is both registered and referenced by a task or scope:

```tsx
const customer = useAIPageElementHandle({
  id: "customer-detail",
  title: "Customer detail",
  getContext: () => customerRecord,
});

return (
  <AIPageContextScope context={customer.context}>
    <section ref={customer.ref}>...</section>
  </AIPageContextScope>
);
```

Context is resolved again immediately before sending, so the model receives the latest page values. Resolution failures block the request by default. Set `contextFailurePolicy="omit"` on `NocoBaseAIRootProvider` only when sending without unavailable context is an intentional product decision.

Nested scopes replace the parent scope by default. Use `mode="append"` to compose parent and child context.

## Form filler

Register forms with `useAIForm`. Sending a registered form Context automatically enables the fixed `formFiller` Tool; tasks do not need to add it to `skillSettings.tools`.

The runtime applies only declared, editable, type-compatible fields. It never submits or saves the form. React Hook Form users can install `@nocobase/ai-react-hook-form` and import `applyReactHookFormValues` from `src/extensions/nocobase-ai/adapters/react-hook-form`.

## Frontend Tools

Frontend Tools are page-local browser actions and remain separate from Form filler. Use `defineAIFrontendTool` for typed registration, provide a JSON input schema, and choose `ASK` or `ALLOW`. Runtime permission controls approval; prompts should not simulate approval behavior.

## Tool cards

Pass application-specific message renderers through `NocoBaseAIRootProvider.toolRenderers`. Built-in renderers remain available automatically. A custom renderer receives the Tool part, disabled state, edit/approve/reject actions, and a composer-focus callback.

## Chat surfaces

Use one `AIChatWindow` inside `ChatSurface` when a global conversation can switch between a side panel and an expanded dialog. Change only the `variant` prop so the message list, composer, scroll position, and renderer state remain mounted:

```tsx
<ChatSurface
  open={open}
  variant={expanded ? "dialog" : "side-panel"}
  onOpenChange={setOpen}
>
  <AIChatWindow />
</ChatSurface>
```

`ChatDialog` and `ChatSidePanel` remain available as convenience wrappers for fixed, non-switching placements.

## Registry development

- In the Registry source repository, edit `registry/nocobase-ai` directly. The normal `pnpm dev` and `pnpm build` commands load canonical Registry source without a preview copy.
- Keep relative imports inside this Registry root. Use the host application's `@/` alias for application services and shared components.
- During publication, the release pipeline materializes default Registry items into the npm template's `src/extensions` directory.

Once installed in an application, `src/extensions/nocobase-ai` is application-owned source and can be edited and committed normally.
