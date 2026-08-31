# Registry Provider UI Example

This item follows the same ownership pattern as the previous Registry's i18n
provider. It provides an application-owned React Provider, context, and hook;
it has no page, route, or `extension.ts`.

After installation, wrap the required application subtree with
`ExampleUiProvider`, then read or update the UI density with `useExampleUi`.
Keeping the provider in a separate item lets an application install this
runtime composition without installing the page or component examples.

The source belongs to the consuming application after installation. Review
upgrades with a three-way merge instead of overwriting application changes.
