# Registry Component UI Example

This item follows the same pattern as the reusable components in the previous
`nocobase-client` Registry. It has no page, route, or `extension.ts` because
none are required for a directly imported component.

After installation, import `EditablePanel` through the item's `index.ts` and
compose it into any application page, dialog, drawer, block, or layout. The
component accepts data and callbacks from its caller instead of importing
plugin internals.

The source belongs to the consuming application after installation. Review
upgrades with a three-way merge instead of overwriting application changes.
