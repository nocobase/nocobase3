import { useEffect, useState, type ReactElement } from 'react';
import type {
  AccessScope,
  AuthorizationOptions,
  AuthorizationRecordOption,
} from '../authorization-client.js';
import { ScopeEditor } from './editors.js';

export interface BusinessRuleScope {
  action: string;
  scopeKey?: string;
  scope: AccessScope;
}

/** A row always carries the table of its declared scope, including record pickers. */
export function BusinessRuleScopes({
  options,
  resourceId,
  value,
  onChange,
  loadRecords,
}: {
  options: AuthorizationOptions;
  resourceId: string;
  value: readonly BusinessRuleScope[];
  onChange: (value: readonly BusinessRuleScope[]) => void;
  loadRecords: (
    collection: string,
  ) => Promise<readonly AuthorizationRecordOption[]>;
}): ReactElement {
  const resource = options.resourceTypes
    .find((type) => type.value === 'resource')
    ?.resources.find((item) => item.value === resourceId);
  return (
    <div className='divide-y rounded-lg border'>
      {[...new Set(resource?.ruleScopes?.map((target) => target.action))].map(
        (action) => {
          const targets = resource!.ruleScopes!.filter(
            (target) => target.action === action,
          );
          const actionLabel =
            resource!.actions?.find((item) => item.value === action)?.label ??
            action;
          const multiple = targets.length > 1;
          return (
            <section
              key={action}
              aria-label={actionLabel}
              className='px-3 py-2'
            >
              {multiple && (
                <h3 className='mb-2 text-sm font-medium'>{actionLabel}</h3>
              )}
              <div className={multiple ? 'ml-2 space-y-2 border-l pl-3' : ''}>
                {targets.map((target) => {
                  const current = value.find(
                    (item) =>
                      item.action === target.action &&
                      item.scopeKey === target.scopeKey,
                  );
                  const change = (scope?: AccessScope) =>
                    onChange([
                      ...value.filter(
                        (item) =>
                          item.action !== target.action ||
                          item.scopeKey !== target.scopeKey,
                      ),
                      ...(scope
                        ? [
                            {
                              action: target.action,
                              scopeKey: target.scopeKey,
                              scope,
                            },
                          ]
                        : []),
                    ]);
                  return (
                    <section
                      key={JSON.stringify([target.action, target.scopeKey])}
                      className={`grid items-start gap-2 ${current?.scope.type === 'ids' || (current?.scope.type === 'database' && typeof current.scope.recordAccess === 'object') ? '' : 'sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)]'}`}
                    >
                      <label className='flex min-h-9 items-center gap-2 text-sm font-normal'>
                        <input
                          type='checkbox'
                          checked={Boolean(current)}
                          onChange={(event) =>
                            change(
                              event.target.checked
                                ? { type: 'all' }
                                : undefined,
                            )
                          }
                        />
                        {multiple ? target.label : actionLabel}
                      </label>
                      {current && (
                        <BusinessScopeValue
                          options={{
                            ...options,
                            recordAccessPolicies:
                              options.recordAccessPolicies.filter(
                                (policy) =>
                                  !target.policies ||
                                  target.policies.includes(policy.value),
                              ),
                          }}
                          collection={target.collection}
                          value={current.scope}
                          onChange={change}
                          loadRecords={loadRecords}
                        />
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          );
        },
      )}
    </div>
  );
}
function BusinessScopeValue({
  options,
  collection,
  value,
  onChange,
  loadRecords,
}: {
  options: AuthorizationOptions;
  collection: string;
  value: AccessScope;
  onChange: (scope: AccessScope) => void;
  loadRecords: (
    collection: string,
  ) => Promise<readonly AuthorizationRecordOption[]>;
}): ReactElement {
  const [records, setRecords] = useState<readonly AuthorizationRecordOption[]>(
    [],
  );
  useEffect(() => {
    let active = true;
    void loadRecords(collection).then(
      (items) => {
        if (active) setRecords(items);
      },
      () => {
        if (active) setRecords([]);
      },
    );
    return () => {
      active = false;
    };
  }, [collection, loadRecords]);
  return (
    <ScopeEditor
      compact
      options={options}
      fields={
        options.collections.find((item) => item.name === collection)?.fields ??
        []
      }
      records={records}
      value={value}
      onChange={onChange}
    />
  );
}
