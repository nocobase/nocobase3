import { useEffect, useState, type ReactElement } from 'react';
import type {
  AuthorizationOptions,
  AuthorizationRecordOption,
  RecordSelection,
} from '../authorization-client.js';
import { SelectionEditor } from './editors.js';
import { dataScopeTargets, findResource } from './localized-options.js';

/** One rule action on one data scope of a business action. */
export interface DataScopeRuleAction {
  action: string;
  scopeKey?: string;
  selection: RecordSelection;
}

/** Each data scope of a business resource, with the selection a rule gives it. */
export function DataScopesEditor({
  options,
  resourceId,
  value,
  onChange,
  loadRecords,
  allowAll = true,
}: {
  options: AuthorizationOptions;
  resourceId: string;
  value: readonly DataScopeRuleAction[];
  onChange: (value: readonly DataScopeRuleAction[]) => void;
  loadRecords: (
    collection: string,
  ) => Promise<readonly AuthorizationRecordOption[]>;
  /** Sharing rules may not select every record. */
  allowAll?: boolean;
}): ReactElement {
  const resource = findResource(options, { type: 'business', id: resourceId });
  const allTargets = dataScopeTargets(options, resourceId);
  return (
    <div className='divide-y rounded-lg border'>
      {[...new Set(allTargets.map((target) => target.action))].map((action) => {
        const targets = allTargets.filter((target) => target.action === action);
        const actionLabel =
          resource?.actions?.find((item) => item.value === action)?.label ??
          action;
        const multiple = targets.length > 1;
        return (
          <section key={action} aria-label={actionLabel} className='px-3 py-2'>
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
                const change = (selection?: RecordSelection) =>
                  onChange([
                    ...value.filter(
                      (item) =>
                        item.action !== target.action ||
                        item.scopeKey !== target.scopeKey,
                    ),
                    ...(selection
                      ? [
                          {
                            action: target.action,
                            scopeKey: target.scopeKey,
                            selection,
                          },
                        ]
                      : []),
                  ]);
                return (
                  <section
                    key={JSON.stringify([target.action, target.scopeKey])}
                    className={`grid items-start gap-2 ${current?.selection.type === 'records' || (current?.selection.type === 'recordAccess' && current.selection.key === 'customFilter') ? '' : 'sm:grid-cols-[minmax(9rem,1fr)_minmax(0,2fr)]'}`}
                  >
                    <label className='flex min-h-9 items-center gap-2 text-sm font-normal'>
                      <input
                        type='checkbox'
                        checked={Boolean(current)}
                        onChange={(event) =>
                          change(
                            event.target.checked
                              ? allowAll
                                ? { type: 'all' }
                                : { type: 'records', ids: [] }
                              : undefined,
                          )
                        }
                      />
                      {multiple ? target.label : actionLabel}
                    </label>
                    {current && (
                      <DataScopeValue
                        allowAll={allowAll}
                        options={{
                          ...options,
                          recordAccess: options.recordAccess.filter((entry) =>
                            target.recordAccess.includes(entry.value),
                          ),
                        }}
                        collection={target.collection}
                        value={current.selection}
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
      })}
    </div>
  );
}
function DataScopeValue({
  options,
  collection,
  value,
  onChange,
  loadRecords,
  allowAll,
}: {
  options: AuthorizationOptions;
  collection: string;
  value: RecordSelection;
  onChange: (selection: RecordSelection) => void;
  allowAll: boolean;
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
    <SelectionEditor
      compact
      allowAll={allowAll}
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
