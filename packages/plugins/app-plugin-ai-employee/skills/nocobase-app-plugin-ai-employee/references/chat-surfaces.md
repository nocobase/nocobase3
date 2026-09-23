# Chat Surfaces in an App

Everything the browser half needs: getting the UI source into the App, mounting it so the first send works, and the four ways a page tells the assistant what it is looking at.

## Table of contents

- [Install the extension](#install-the-extension)
- [Upgrading an installed copy](#upgrading-an-installed-copy)
- [Provider hierarchy](#provider-hierarchy)
- [The readiness gate](#the-readiness-gate)
- [Surfaces](#surfaces)
- [Attachments](#attachments)
- [Tasks and shortcuts](#tasks-and-shortcuts)
- [Page context](#page-context)
- [Forms](#forms)
- [Frontend tools](#frontend-tools)
- [Tool renderers](#tool-renderers)
- [Settings pages](#settings-pages)
- [First-send acceptance checks](#first-send-acceptance-checks)

## Install the extension

The React UI is a shadcn Registry item named `nocobase-ai`, owned by `@nocobase/app-plugin-ai-employee` and installed as App source at `client/extensions/nocobase-ai`. It is App-owned once installed: edit and commit it like any other App file. The plugin package exports no chat UI, so a missing extension is never a reason to import React components from `@nocobase/ai-employee`, to patch the plugin, or to rebuild chat under `client/`.

Check for `client/extensions/nocobase-ai/index.ts` first. If it exists, reuse it. If not, use the first option below that applies.

### Option 1 — from the App's own installed plugin (preferred)

The published plugin ships its canonical source and a self-contained Registry JSON, so a generated App can install from the copy already resolved in its own `node_modules`. The installed UI then matches the plugin version the App actually runs, with no network access and no NocoBase source checkout. Run from the App root:

```bash
node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const manifest = require.resolve("@nocobase/app-plugin-ai-employee/package.json");
const item = JSON.parse(
  fs.readFileSync(path.join(path.dirname(manifest), "public/r/nocobase-ai.json"), "utf8"),
);
for (const file of item.files) {
  const target = path.resolve(process.cwd(), file.target);
  if (!target.startsWith(process.cwd() + path.sep)) {
    throw new Error(`Unsafe Registry target: ${file.target}`);
  }
  if (fs.existsSync(target)) {
    throw new Error(`Refusing to overwrite: ${file.target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.content);
}
console.log(`Installed ${item.files.length} files into client/extensions/nocobase-ai.`);
'
```

Resolve the JSON through the package manifest rather than a hand-written `node_modules` path; pnpm does not place packages at a predictable depth. Take every destination from `files[].target`. The refusal on an existing target is deliberate — installation must never overwrite App-owned source.

### Option 2 — from a NocoBase source workspace

Only when the current tree is the NocoBase source repository, such as when preinstalling into an application template:

```bash
pnpm registry materialize --package @nocobase/app-plugin-ai-employee \
  --item nocobase-ai --output-root /absolute/path/to/app
```

It copies source only and refuses an existing target. It does not run from a generated App, because it reads `registry.config.json` from the workspace rather than from an installed package.

### Option 3 — from a hosted Registry

`shadcn add <registry-url>/nocobase-ai.json` works only once the Registry JSON is served over HTTP(S); an npm tarball containing `public/r/` is not a Registry. It resolves the item's declared npm dependencies but installs whatever version that URL currently serves, which can differ from the plugin the App runs. Prefer Option 1, and state the version risk explicitly when only this option is available.

### After installing

The item declares npm `dependencies` the App must provide; `registryDependencies` is empty, so no shadcn primitive is required. Check what is missing from the App root:

```bash
node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const manifest = require.resolve("@nocobase/app-plugin-ai-employee/package.json");
const item = JSON.parse(
  fs.readFileSync(path.join(path.dirname(manifest), "public/r/nocobase-ai.json"), "utf8"),
);
const app = JSON.parse(fs.readFileSync("package.json", "utf8"));
const declared = { ...app.dependencies, ...app.devDependencies };
const missing = item.dependencies
  .map((spec) => spec.slice(0, spec.lastIndexOf("@")))
  .filter((name) => !declared[name]);
console.log(missing.length ? `Missing: ${missing.join(" ")}` : "All Registry dependencies are declared.");
'
```

This source is compiled by the App's own Vite build, so its npm dependencies belong in the App's `devDependencies` unless the App already depends on the package at runtime. Then read `client/extensions/nocobase-ai/README.md`, confirm the import alias the App uses, and run the App's lint, typecheck, test, and build before building on top of it.

## Upgrading an installed copy

Never rerun an installer over an installed copy; both refuse precisely because the App may have edited that source. Install the new version into a separate temporary directory, three-way merge the previous Registry source, the new Registry source, and the App copy, and keep the declared dependencies in step with the result.

## Provider hierarchy

```tsx
<NocoBaseAIRootProvider
  service={nocobaseAIService}
  toolRenderers={appToolRenderers}
>
  <YourApplication />
</NocoBaseAIRootProvider>
```

It composes `AIProvider`, `AIToolRendererProvider`, and `AIPageElementProvider` in the required order, and it reads the App's API client, so it must sit under the App's existing client providers. Reach for the lower-level providers only when deliberately replacing one layer, and keep the ordering.

```ts
type NocoBaseAIRootProviderProps = AIProviderProps & {
  toolRenderers?: AIToolRendererMap;
  contextFailurePolicy?: 'throw' | 'omit';
};

type AIProviderProps = PropsWithChildren<{
  employees?: AIEmployee[]; // omit to let the service load them
  models?: AIModel[]; // omit to let the service load them
  service?: AIService; // defaults to nocobaseAIService
  toolInvokers?: AIToolInvokerMap;
  globalController?: AIChatController;
}>;
```

Do not override the reserved invoker names `formFiller`, `loadFrontendTool`, or `executeFrontendTool`. If `employees` and `models` are supplied, supply both; otherwise let the service load both.

## The readiness gate

`NocoBaseAIRootProvider` starts employee and model discovery asynchronously and does **not** defer mounting its children. A chat initialized before discovery finishes shows fallback defaults while its internal selection and transport still reflect an empty configuration, and the first send fails or silently uses nothing. A loading overlay over an already-mounted chat does not fix this, because the chat has already initialized underneath it.

So gate the whole `AIChatProvider` subtree from a child component that reads `useAI()` under the root, and check the three signals separately — `configurationStatus` can be `'ready'` while model discovery failed, and `models` can hold a `configured: false` placeholder, so neither status nor array length alone proves the chat can send.

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
    <AIChatProvider
      id='assistant-chat'
      controller={controller}
      defaultEmployee='order-desk'
    >
      <ChatInline>
        <AIChatWindow enableAttachments />
      </ChatInline>
    </AIChatProvider>
  );
}

export default function AssistantPage() {
  return (
    <NocoBaseAIRootProvider service={nocobaseAIService}>
      <ConfiguredChat />
    </NocoBaseAIRootProvider>
  );
}
```

Use the App's real import alias and localize the messages. If a root AI provider already wraps the route, mount `ConfiguredChat` under it rather than nesting a second root. Call hooks unconditionally before the guards return, and keep the controller identity stable. Do not key the chat by employee or model to force re-initialization — that discards conversation state. Recovery from a configuration error is a page reload, not an employee or model switch.

`defaultEmployee` is not optional in practice. Without it the chat opens on `employees[0]`, which is the lowest `sort` across every enabled employee — and the built-in `atlas` ships with `sort: 0`, so a page built to talk to the App's own employee opens on the router instead. The readiness gate passes either way and the first send works, so nothing looks wrong; the conversation is just with the wrong assistant. Pass the username explicitly.

## Surfaces

```ts
type AIChatProviderProps = PropsWithChildren<{
  id: string; // required, stable chat id — one per conversation scene
  controller?: AIChatController;
  defaultEmployee?: string; // an employee username
  defaultTasks?: AIEmployeeTask[];
  employeeTasks?: Record<string, AIEmployeeTask[]>; // keyed by employee username
  webSearch?: boolean; // the provider's own built-in search, where supported
}>;
```

`ChatInline`, `ChatPage`, `ChatDialog`, `ChatSidePanel`, and the variant-switching `ChatSurface` are the available containers. To expand a chat from side panel to dialog, change `ChatSurface.variant` rather than remounting: that preserves messages, composer, scroll, and tool state.

`AIChatWindow` is the chat itself:

```ts
type AIChatWindowProps = {
  className?: string;
  headerActions?: ReactNode;
  composerActions?: AIChatComposerAction[];
  showConversationToggle?: boolean; // default true
  showNewConversation?: boolean; // default true
  showEmployeeSelector?: boolean; // default true
  showModelSelector?: boolean; // default true
  showUserPrompt?: boolean; // default true
  enableAttachments?: boolean; // default false
  attachmentActionIndex?: number; // default 0
  placeholder?: string;
  disclaimer?: ReactNode | false;
  onToolCallDecision?: (decision: AIToolCallDecision) => void | Promise<void>;
};
```

`AIChatFloatingTrigger` takes `aiEmployee?`, `controller?`, `unreadCount?` (0), `position?` (`'fixed'`), `hideWhenOpen?` (true), and `className?`. Without `aiEmployee` the trigger opens the chat on that chat's own `defaultEmployee`, so the username is set once, on `AIChatProvider`; pass `aiEmployee` only when this trigger should open a different employee.

## Attachments

`enableAttachments` is off by default. Turning it on gives the composer a file action, drag-and-drop over the chat window, and paste of files from the clipboard — no extra code. Uploads go to `aiFiles:create` and land on the disk resolved in [capabilities.md § Attachment storage](capabilities.md#attachment-storage-configyml); decide that disk with the user before switching this on.

What the assistant then sees is decided server-side, not by the page. Every provider sends images to the model as content blocks; PDFs go as documents on some providers and as loader-extracted text on others, and on a gateway provider a document is accepted only if the endpoint behind it takes one; other recognized document types are extracted to text; anything else produces a message telling the user the type is unsupported. Which provider does what is in [capabilities.md § What each provider can actually do](capabilities.md#what-each-provider-can-actually-do). So "drop a file in and have the assistant read it" needs no tool and no OCR step — it needs `enableAttachments`, a configured disk, and a model that accepts images.

That last one is on you to get right, and nothing checks it. `AIModel` has no field for image input, so neither the selector nor the composer can warn that the selected model will not read the picture. When a flow can start from an image, say so in the employee's description and make the chat's default model one that accepts images — which means `defaultEmployee` here and, on the server, `overrideEnabledModels` plus service `sort`, since the chat opens on the first model of the first enabled service.

## Tasks and shortcuts

```ts
type AIEmployeeTask = {
  title?: string;
  message?: {
    system?: string;
    user?: string;
    workContext?: AIWorkContextItem[];
  };
  autoSend?: boolean;
  skillSettings?: { skills?: string[]; tools?: string[] };
  webSearch?: boolean;
  model?: { llmService?: string; model: string };
};
```

Use `AIChatProvider.employeeTasks` for empty-state presets and `AIEmployeeShortcut` for an entry point outside the chat, keeping both on the same controller. `message.user` is the prompt, `message.system` is background, and `message.workContext` holds references rather than resolved data. Use `autoSend: false` when the user should review the context or the generated request first. An explicit `task.message.workContext` overrides the trigger's context and the surrounding scope.

`AIEmployeeShortcut` takes `aiEmployee` (username or object, required), `tasks?` (`[]`), `context?`, `target?` (defaults to the global controller), `auto?`, `size?` (48), `label?`, `showNotice?` (false), `className?`, and `onTrigger?`.

## Page context

**`AIPageContextScope` must be an ancestor of the chat, not of the element it describes.** It is a React context provider, and `AIChatProvider` reads the nearest one above itself when it mounts. Wrapping the described element instead compiles, renders, and sends an empty context forever, with nothing reported. The `ref` goes on the visible element; the scope goes around the chat.

```tsx
const customer = useAIPageElementHandle({
  id: 'customer-detail', // required for the handle form; use a stable id
  title: 'Customer detail',
  getContext: () => ({ customer: currentCustomer }),
});

return (
  <AIPageContextScope context={customer.context}>
    <section ref={customer.ref}>...</section>
    <ConfiguredChat />
  </AIPageContextScope>
);
```

When the chat lives in a side panel, a dialog, or the application shell rather than beside the element, put the scope high enough to contain both — or hand the reference to the chat through a task's `message.workContext` instead.

```ts
type AIPageElementDescriptor = {
  id?: string;
  title: string; // required display label
  kind?: string;
  getContext: () => unknown; // awaited, so a promise is fine
  tools?: AIFrontendToolRegistration[];
};
```

`useAIPageElement(descriptor)` returns just the ref callback; `useAIPageElementHandle(descriptor)` requires `id` and returns `{ ref, context }`. Attach `ref` to the element the user can actually see. `getContext` runs immediately before selection or send, so return current values, and return plain structured-clone-safe data — never DOM nodes, callbacks, React or form instances, secrets, cyclic objects, or unbounded record sets.

`AIPageContextScope` takes `context` (one item or an array, required), `mode` (`'replace'` default, `'append'` to compose with a parent scope), and children. `createAIPageContextReference` makes a stable reference, and `useAIPageElementPicker()` exposes `picking`, `registeredCount`, `startPicking(options)`, and `cancelPicking()` for manual selection. A context resolution failure blocks sending by default; set `contextFailurePolicy='omit'` only when sending without context is intended product behavior.

## Forms

```tsx
const formRef = useAIForm({
  id: 'order-form',
  title: 'Order form',
  fields: [
    { name: 'customer', type: 'string', required: true },
    { name: 'status', type: 'string', enum: ['draft', 'confirmed'] },
  ],
  getValues: () => form.getValues(),
  setValues: (values) => applyReactHookFormValues(form, values),
});
```

Attach the returned ref to the visible form. `applyReactHookFormValues` is the shipped react-hook-form adapter, imported from `@/extensions/nocobase-ai/adapters/react-hook-form` — it is not part of the extension's `index.ts`, so importing it from the package root fails to compile.

`useAIForm` returns a ref and nothing else. Registering the form does not put it in the conversation, and there is no context handle to pass along, so a chat on the same page still sees nothing until the form is referenced. Build the reference yourself and scope it around the chat:

```tsx
const formRef = useAIForm({ id: 'order-form', title: 'Order form', ... });
const formContext = useMemo(
  () => createAIPageContextReference({ id: 'order-form', title: 'Order form' }),
  [],
);

return (
  <AIPageContextScope context={formContext}>
    <form ref={formRef}>...</form>
    <ConfiguredChat />
  </AIPageContextScope>
);
```

Sending that context is what activates the built-in `formFiller`; do not add a duplicate App tool and do not list `formFiller` in a task's skill settings. The alternative is to leave the form unreferenced and let the user pick it with `useAIPageElementPicker()`, which is the right choice when a page has several forms and only one is meant at a time.

Field `name` values must be unique. `AIFormField` accepts `name`, `title?`, `type?`, `description?`, `readonly?`, `required?`, `enum?`, and extra keys. Built-in type validation covers string/text/textarea/email/url/date/datetime, number/percent, integer, boolean/checkbox, array, and object. `setValues` receives only declared, editable, type- and enum-compatible fields, the runtime reports what it applied and skipped, and it never submits or saves — submission stays an explicit user or App action.

## Frontend tools

A frontend tool is a page-local browser action, distinct from the backend `defineTools()` resources in `server/ai/tools/`.

```tsx
const quote = useAIPageElementHandle({
  id: 'quote-editor',
  title: 'Quote editor',
  getContext: () => ({ draft }),
  tools: [
    defineAIFrontendTool({
      name: 'applyDiscount', // /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
      title: 'Apply discount',
      description: 'Change the visible draft discount.',
      permission: 'ASK', // default 'ASK'
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

The runtime id is `${contextId}:${name}`, and page context sends an allowlisted manifest of them. The agent calls the built-in `loadFrontendTool` and then `executeFrontendTool`; the browser executes only for an id that is currently allowed. `inputSchema` defaults to `{ type: 'object', properties: {} }`, and both it and the result must survive structured cloning.

`ALLOW` is for harmless, reversible, local UI changes. Anything that persists, mutates business state, or navigates with side effects stays `ASK`. A prompt asking the model to be careful is not a permission.

## Tool renderers

Pass App-specific renderers through `NocoBaseAIRootProvider.toolRenderers`, keyed by exact tool name. Built-in renderers already cover suggestions, charts, workflow, sub-agents, and business reports.

```ts
type AIToolRendererProps = {
  part: ToolCallPart;
  disabled: boolean;
  onEdit: (input: unknown) => void | Promise<void>;
  onApprove: () => void | Promise<void>;
  onReject: (message?: string) => void | Promise<void>;
  onRevise: () => void;
};

type AIToolRendererDefinition = {
  component: React.ComponentType<AIToolRendererProps>;
  handlesApproval?: boolean; // the renderer presents approval controls itself
  standalone?: boolean; // rendered outside the generic card layout
};
```

A renderer controls presentation only. It must call the supplied callbacks rather than mutating persisted tool state, and must preserve invocation status, approval/edit/reject, resume behavior, and disabled state.

## Settings pages

Contribute an independent sidebar entry with `defineSettingsRoutes()` and `parent: 'aiGroup'`, registered through the contributing plugin's client `routes`:

```ts
import { defineSettingsRoutes } from '@nocobase/app-client/plugins';

export default defineSettingsRoutes([
  {
    parent: 'aiGroup',
    name: 'acme-ai',
    path: '/ai/acme',
    navigation: { title: 'Acme AI' },
    authz: { resource: { type: 'page', id: 'ai.settings' }, action: 'access' },
    componentLoader: () => import('./pages/acme-ai-settings.js'),
  },
]);
```

Use a unique name and path, a lazily loaded default-exported component, translated navigation, and an explicit access policy; server operations still enforce their own permissions. The plugin's own settings actions on `/api/ai` check the same `page:ai.settings` access, so a page that calls them under a different policy shows its users a 403 rather than working for them. Keep detail routes beneath their owning page with an `Outlet` and guards.

AI Employees at `/settings/ai` is employee-only and renders no cross-feature tabs. `registerAISettingsTabs` and `getAISettingsTabs` remain as deprecated compatibility APIs but registered tabs no longer render, and `AISettingsShellProps.activeTabKey` and `onTabChange` are accepted with no effect. Migrate any old tab contribution to a sidebar route; built-in legacy tab URLs redirect to standalone routes, but a custom tab integration must declare its own migration route.

## First-send acceptance checks

- Open the page with discovery delayed. A loading status is visible and the chat neither mounts nor offers a send action until both employee and model discovery finish.
- Once ready, leave the displayed default employee and model alone, type, and send. Conversation creation and the stream request use those defaults, the draft clears, and the message appears.
- Reload and repeat the first send without switching anything — this tests a fresh mount, not a warm one.
- Simulate each failure separately: employee discovery failure, no accessible employees, model discovery failure, and no enabled models including an unconfigured placeholder. Each shows its own actionable alert instead of a composer that looks usable. After fixing configuration and reloading, the first send works.
- Run these against the real service and transport. A mocked composer callback proves neither conversation creation nor sending.
