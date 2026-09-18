import {
  useRef,
  type RefObject,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  ResourceOption,
  SelectOption,
} from '../../authorization-client.js';
import { ScopedOperation } from './scoped-operation.js';
import { ScopeMark } from '../../components/scope-marks.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { BulkPermissionToggle } from './bulk-permissions.js';
import { newGrantForResource, resourceKey } from './drafts.js';
import { descendantGroups, type ResourceRow } from './resource-groups.js';
import type { Draft, GrantDraft } from './types.js';

export function ModulePermissions({
  container,
  type,
  label,
  rows,
  items,
  actions,
  draft,
  disabled,
  filtered,
  collapsed,
  onCollapse,
  onChange,
  onToggle,
}: {
  container?: RefObject<HTMLDivElement | null>;
  type: string;
  label: string;
  rows: readonly ResourceRow[];
  items: readonly ResourceOption[];
  actions: readonly SelectOption[];
  draft: Draft;
  disabled: boolean;
  filtered: boolean;
  collapsed: ReadonlySet<string>;
  onCollapse: (id: string) => void;
  onChange: (draft: Draft) => void;
  onToggle: (grant: GrantDraft, action: string, mode: string) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const grants = new Map(
    draft.grants.map((grant) => [
      resourceKey(grant.resource.type, grant.resource.id),
      grant,
    ]),
  );
  const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(12rem, 32%) minmax(0, 1fr) 2rem',
    alignItems: 'center',
    columnGap: '0.75rem',
    paddingRight: '1rem',
  };
  const bulk = (targets: readonly ResourceOption[], name: string) => (
    <span style={{ display: 'flex', width: '2rem', justifyContent: 'center' }}>
      <BulkPermissionToggle
        items={targets}
        actions={actions}
        type={type}
        draft={draft}
        disabled={disabled}
        label={
          type === 'page' && actions.length === 1
            ? `${actions[0].label}: ${name}`
            : name
        }
        onChange={onChange}
      />
    </span>
  );
  return (
    <div ref={containerRef} className='relative text-sm'>
      <div
        className='sticky top-0 z-10 border-b bg-background py-2'
        style={rowStyle}
      >
        <span className='pl-4 font-medium'>{label}</span>
        <span className='text-right text-xs text-muted-foreground'>
          {t(
            filtered
              ? 'permissionWorkspace.selectFiltered'
              : 'permissionWorkspace.selectAll',
          )}
        </span>
        {bulk(
          items,
          t(
            filtered
              ? 'permissionWorkspace.selectFiltered'
              : 'permissionWorkspace.selectAll',
          ),
        )}
      </div>
      {rows.map((row) => {
        if (row.kind === 'group') {
          const groups = descendantGroups([row.group], row.group.value);
          return (
            <div
              key={`group:${row.group.value}`}
              className='border-b bg-muted/20'
              style={rowStyle}
            >
              <button
                type='button'
                aria-expanded={!collapsed.has(row.group.value)}
                className='flex min-w-0 flex-1 items-center gap-2 py-2 text-left font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                style={{
                  paddingLeft: 16 + row.depth * 20,
                  gridColumn: '1 / 3',
                }}
                onClick={() => onCollapse(row.group.value)}
              >
                {collapsed.has(row.group.value) ? (
                  <ChevronRight className='size-4 shrink-0' />
                ) : (
                  <ChevronDown className='size-4 shrink-0' />
                )}
                {row.group.label}
              </button>
              {bulk(
                items.filter(
                  (item) => item.group && groups.includes(item.group),
                ),
                t('permissionWorkspace.selectGroup', {
                  group: row.group.label,
                }),
              )}
            </div>
          );
        }
        const item = row.item;
        const grant =
          grants.get(resourceKey(type, item.value)) ??
          newGrantForResource(type, item.value);
        return (
          <div
            key={`item:${item.value}`}
            role='group'
            aria-label={item.label}
            className='items-center gap-3 border-b py-2 pr-4 hover:bg-muted/20'
            style={rowStyle}
          >
            <div
              className='flex min-w-0 items-center gap-2'
              style={{ paddingLeft: 16 + row.depth * 20 }}
            >
              <span className='shrink-0 font-medium'>{item.label}</span>
              <span
                className='truncate text-xs text-muted-foreground'
                title={item.value}
              >
                {item.value}
              </span>
            </div>
            <div className='flex min-w-0 flex-wrap gap-x-3 gap-y-1'>
              {(item.actions ?? actions).map((action) => {
                const granted = grant.actions.includes(action.value);
                const config = item.actionScopes?.[action.value];
                if (config)
                  return (
                    <ScopedOperation
                      key={action.value}
                      container={container ?? containerRef}
                      item={item}
                      action={action}
                      config={config}
                      grant={grant}
                      disabled={disabled}
                      onToggle={onToggle}
                      onChange={(next) =>
                        onChange({
                          ...draft,
                          grants: draft.grants.map((g) =>
                            g.id === next.id ? next : g,
                          ),
                        })
                      }
                    />
                  );
                return (
                  <button
                    key={action.value}
                    type='button'
                    disabled={disabled}
                    aria-label={`${item.label}: ${action.label}`}
                    aria-pressed={granted}
                    className='inline-flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
                    onClick={() =>
                      onToggle(
                        grant,
                        action.value,
                        type === 'database.collection'
                          ? 'custom'
                          : granted
                            ? 'none'
                            : 'all',
                      )
                    }
                  >
                    <ScopeMark
                      value={granted ? 'all' : 'none'}
                      label={t(
                        granted
                          ? 'permissionWorkspace.moduleGranted'
                          : 'permissionWorkspace.moduleNotGranted',
                      )}
                    />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
            {bulk(
              [item],
              t('permissionWorkspace.selectGroup', { group: item.label }),
            )}
          </div>
        );
      })}
    </div>
  );
}
