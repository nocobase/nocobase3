/**
 * Translation values are leaves; anything else is a nested group of keys.
 */
type TranslationLeaf = string | number | boolean;

/**
 * Every addressable path in a resource object, as the dot-separated strings `t()` accepts.
 *
 * `{ trigger: { title: 'Trigger' } }` flattens to `'trigger' | 'trigger.title'`. The group itself stays in the union
 * because i18next resolves a group to its own `defaultValue` when one is present.
 */
export type FlattenKeys<TResource> = TResource extends TranslationLeaf
  ? never
  : {
      [Key in keyof TResource & string]: TResource[Key] extends TranslationLeaf
        ? Key
        : Key | `${Key}.${FlattenKeys<TResource[Key]>}`;
    }[keyof TResource & string];

/**
 * A translation key that suggests the namespace's own keys without rejecting anything else.
 *
 * Writing a key that belongs to the application or to the base package is legitimate — the fallback chain exists for
 * exactly that — so the union stays open through `string & {}`, which preserves completion for the known keys while
 * still accepting an arbitrary string.
 */
export type TranslationKey<TResource = never> = [TResource] extends [never]
  ? string
  : FlattenKeys<TResource> | (string & {});
