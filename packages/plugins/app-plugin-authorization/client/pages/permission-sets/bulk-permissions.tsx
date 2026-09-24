import { SelectionMark } from '../../components/selection-marks.js';
import type { ReactElement } from 'react';
import type {
  ResourceOption,
  SelectOption,
} from '../../authorization-client.js';
import type { Draft, GrantDraft } from './types.js';
import { newGrantForResource, resourceKey } from './drafts.js';
import { scopeKey, scopeValue } from './composite-policy.js';

export function BulkPermissionToggle({
  items,
  actions,
  draft,
  disabled,
  label,
  onChange,
}: {
  items: readonly ResourceOption[];
  actions: readonly SelectOption[];
  draft: Draft;
  disabled: boolean;
  label: string;
  onChange: (draft: Draft) => void;
}): ReactElement {
  const grants = new Map(
    draft.grants.map((grant) => [
      resourceKey(grant.resource.type, grant.resource.id),
      grant,
    ]),
  );
  const targets = items
    .map((item) => ({
      item,
      actions: (item.actions ?? actions).map((action) => action.value),
    }))
    .filter((target) => target.actions.length);
  const total = targets.reduce(
    (count, target) => count + target.actions.length,
    0,
  );
  const selected = targets.reduce(
    (count, target) =>
      count +
      target.actions.filter((action) =>
        grants
          .get(resourceKey(target.item.type, target.item.value))
          ?.actions.includes(action),
      ).length,
    0,
  );
  const full = targets.every(({ item, actions }) =>
    actions.every((action) => {
      const grant = grants.get(resourceKey(item.type, item.value));
      if (!grant?.actions.includes(action)) return false;
      const config = item.dataScopes?.[action];
      return (
        !config ||
        config.every(
          (field) =>
            scopeKey(
              scopeValue(grant.policies?.[action], field.key),
              field.defaultValue,
            ) === 'allRecords',
        )
      );
    }),
  );
  const checked = total > 0 && selected === total;
  return (
    <button
      type='button'
      className='inline-flex rounded-md p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
      aria-label={label}
      title={label}
      aria-pressed={selected > 0 && !checked ? 'mixed' : checked}
      disabled={disabled || !total}
      onClick={() => {
        const next = new Map(grants);
        for (const target of targets) {
          const key = resourceKey(target.item.type, target.item.value);
          const grant =
            next.get(key) ??
            newGrantForResource(target.item.type, target.item.value);
          const updated: GrantDraft = {
            ...grant,
            actions: !checked
              ? [...new Set([...grant.actions, ...target.actions])]
              : grant.actions.filter(
                  (action) => !target.actions.includes(action),
                ),
          };
          if (updated.actions.length) next.set(key, updated);
          else next.delete(key);
        }
        onChange({ ...draft, grants: [...next.values()] });
      }}
    >
      <SelectionMark
        value={checked && full ? 'all' : selected ? 'scoped' : 'none'}
      />
    </button>
  );
}
