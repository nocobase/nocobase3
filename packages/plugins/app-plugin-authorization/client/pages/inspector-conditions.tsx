import { useState, type ReactElement } from 'react';
import { useAuthorizationTranslation } from '../i18n.js';
import { Input } from '../components/ui/input.js';
import type { AuthorizationDecision } from '../authorization-client.js';

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
/** Display-only Boolean absorption: A AND (A OR B) = A, and its dual. */
function simplify(value: unknown): unknown {
  const node = object(value);
  if (node?.kind === 'filter') return simplify(node.root);
  if (
    node?.kind !== 'group' ||
    !Array.isArray(node.items) ||
    !['and', 'or'].includes(String(node.logic))
  )
    return value;
  const items = [
    ...new Map(
      node.items.map((item: unknown) => {
        const normalized = simplify(item);
        return [JSON.stringify(normalized), normalized];
      }),
    ).values(),
  ];
  const reduced = items.filter((item) => {
    const group = object(item);
    return !(
      group?.kind === 'group' &&
      group.logic !== node.logic &&
      Array.isArray(group.items) &&
      group.items.some((child: unknown) =>
        items.some(
          (other) =>
            other !== item && JSON.stringify(other) === JSON.stringify(child),
        ),
      )
    );
  });
  return reduced.length === 1 ? reduced[0] : { ...node, items: reduced };
}
function Condition({ value }: { value: unknown }): ReactElement {
  const t = useAuthorizationTranslation();
  const node = object(value);
  if (node?.kind === 'filter') return <Condition value={node.root} />;
  if (node?.kind === 'group' && Array.isArray(node.items))
    return (
      <div className='space-y-2 rounded-md border p-3'>
        <p className='text-xs font-medium text-muted-foreground'>
          {t(
            node.logic === 'or'
              ? 'inspector.anyCondition'
              : 'inspector.allConditions',
          )}
        </p>
        {node.items.map((item: unknown, index: number) => (
          // Read-only AST nodes have no identifiers; their positions are stable within a decision.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <Condition key={index} value={item} />
        ))}
      </div>
    );
  if (
    node?.kind === 'condition' &&
    Array.isArray(node.path) &&
    typeof node.operator === 'string'
  )
    return (
      <p className='break-words text-sm'>
        {node.path.join('.')}{' '}
        {t(`filterOperators.${node.operator}`, { defaultValue: node.operator })}{' '}
        {node.value === undefined ? '' : JSON.stringify(node.value)}
      </p>
    );
  return (
    <pre className='overflow-auto text-xs'>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
export function InspectionConditions({
  value,
}: {
  value: NonNullable<AuthorizationDecision['conditions']>;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [search, setSearch] = useState('');
  const access = object(value.fieldAccess);
  const directions = access
    ? value.action === 'read'
      ? ['output']
      : value.action === 'delete'
        ? []
        : ['input', 'output']
    : ['fields'];
  const lists = directions.map((direction) => ({
    direction,
    value: direction === 'fields' ? value.fields : access?.[direction],
  }));
  if (value.type !== 'database') return <Condition value={value} />;
  return (
    <div className='space-y-6'>
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('inspector.recordScope')}</h3>
        {value.scope === true ? (
          <p className='text-sm'>{t('labels.allRecords')}</p>
        ) : (
          <Condition value={simplify(value.scope)} />
        )}
      </section>
      {lists.length ? (
        <Input
          aria-label={t('inspector.fieldSearch')}
          placeholder={t('inspector.fieldSearch')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}
      {lists.map((list) => (
        <section key={list.direction} className='space-y-3'>
          <h3 className='text-sm font-medium'>
            {t(
              list.direction === 'input'
                ? 'inspector.inputFields'
                : list.direction === 'output'
                  ? 'inspector.outputFields'
                  : 'inspector.fields',
            )}
          </h3>
          {list.value === '*' ? (
            <p className='text-sm'>{t('inspector.allFields')}</p>
          ) : (
            <ul className='max-h-64 overflow-auto divide-y rounded-md border'>
              {(Array.isArray(list.value) ? list.value : [])
                .filter(
                  (field): field is string =>
                    typeof field === 'string' &&
                    field.toLowerCase().includes(search.toLowerCase()),
                )
                .map((field) => (
                  <li key={field} className='px-3 py-2 text-sm'>
                    {field}
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
