/**
 * The two collections the Repository store reads and writes.
 *
 * The library ships no migration and no schema helper: a migration must spell
 * out its own tables, so the plugin that owns the lifecycles declares them.
 * The fields it needs are those of `TransitionEntry` and
 * `EffectRun`: a `bigInt` auto-increment `id`; strings for names, ids
 * and statuses; `json` for `input` and `result`; `text` for `error`; integers
 * for `version`, `attempts` and `maxAttempts`; and `datetimeTz` for every
 * instant. The transitions collection also takes a unique index on
 * `(lifecycle, recordId, version)`. The effect runs also take a nullable
 * `json` `continuation` and a nullable `datetimeTz` `continuationFailedAt`,
 * which is null exactly when no continuation waits.
 *
 * Each record collection a lifecycle runs on needs its state field, its
 * changed-at field (`datetimeTz`) and its version field (an integer,
 * not null, default 0).
 */
export const LIFECYCLE_COLLECTIONS: {
  readonly transitions: 'lifecycleTransitions';
  readonly effectRuns: 'lifecycleEffectRuns';
} = Object.freeze({
  transitions: 'lifecycleTransitions',
  effectRuns: 'lifecycleEffectRuns',
});
