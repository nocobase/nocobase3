/**
 * The two collections the Repository store reads and writes.
 *
 * The library ships no migration and no schema helper: a migration must spell
 * out its own tables, so the plugin that owns the lifecycles declares them.
 * The fields it needs are those of `TransitionEntry` and
 * `EffectRun`: a `bigInt` auto-increment `id`; strings for names, ids
 * and statuses; `json` for `input` and `result`; `text` for `error`; integers
 * for `attempts` and `maxAttempts`; and `datetimeTz` for every instant.
 */
export const LIFECYCLE_COLLECTIONS: {
  readonly transitions: 'lifecycleTransitions';
  readonly effectRuns: 'lifecycleEffectRuns';
} = Object.freeze({
  transitions: 'lifecycleTransitions',
  effectRuns: 'lifecycleEffectRuns',
});
