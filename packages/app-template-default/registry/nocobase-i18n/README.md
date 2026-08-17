# NocoBase i18n

Optional NocoBase server-language integration and language controls for the
NocoBase Admin Starter.

The Portal SDK owns the Refine i18n provider, i18next runtime, translation
registration protocol, locale state, and shared `systemSettings:get` store.
The application keeps its locale configuration and translation resources in
template-owned source. This Registry adds the NocoBase-specific remote
capabilities:

- load registered dynamic namespaces from `app:getLang`;
- persist a signed-in user's selected language through `users:updateLang`;
- expose reusable page and user-menu language switchers;
- provide an integrated Demo and Prompt generator.

When this Registry is not installed, the Starter still uses the system default
language and all local translations normally. It does not request
`app:getLang`. When installed, the Registry reads the already-cached system
settings and requests only registered server namespaces. `lm-collections` is
registered by default for collection and field metadata.

Application-owned React translations belong in `src/locales`, outside the
installed Registry directory:

```ts
import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";

registerTranslationResources("my-feature", {
  "en-US": { title: "Orders" },
  "zh-CN": { title: "订单" },
});
```

Other installed components can opt into another server-generated namespace:

```ts
import { registerServerResourceNamespace } from "@/extensions/nocobase-i18n";

registerServerResourceNamespace("my-dynamic-namespace");
```

Namespaces registered after startup are loaded incrementally. Existing exact
NocoBase expressions such as `{{t("Orders")}}` remain supported by the
Portal SDK's translation compatibility helper.
