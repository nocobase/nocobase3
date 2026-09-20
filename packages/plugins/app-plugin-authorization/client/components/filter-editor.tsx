import { SelectField } from './select-field.js';
import type {
  FilterNode,
  FilterGroupNode,
  FilterConditionNode,
  FilterOperator,
} from '@nocobase/repository-input';
import type { ReactElement } from 'react';
import { useAuthorizationTranslation } from '../i18n.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { emptyFilter, policyFilter } from './filter-ast.js';

const operators: readonly FilterOperator[] = [
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$includes',
  '$notIncludes',
  '$startsWith',
  '$endsWith',
  '$empty',
  '$notEmpty',
  '$isTruly',
  '$isFalsy',
];
const unary = new Set<FilterOperator>([
  '$empty',
  '$notEmpty',
  '$isTruly',
  '$isFalsy',
]);
const selectClass = 'h-8 min-w-0 rounded-md border bg-background px-2 text-sm';

export function FilterEditor({
  fields,
  value,
  onChange,
}: {
  fields: readonly string[];
  value: FilterNode;
  onChange: (value: FilterNode) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  function render(
    node: FilterNode,
    change: (value: FilterNode) => void,
    remove?: () => void,
  ): ReactElement {
    if (node.kind === 'group') {
      const update = (index: number, next: FilterNode): void =>
        change({
          ...node,
          items: node.items.map((item, i) => (i === index ? next : item)),
        });
      return (
        <div className='min-w-0 space-y-3 rounded-md border bg-muted/10 p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <SelectField
              aria-label={t('filterEditor.logic')}
              className={selectClass}
              value={node.logic}
              onValueChange={(selectedValue) =>
                change({
                  ...node,
                  logic: selectedValue as FilterGroupNode['logic'],
                })
              }
              options={[
                { value: 'and', label: t('filterEditor.all') },
                { value: 'or', label: t('filterEditor.any') },
              ]}
            />
            <Button
              size='sm'
              variant='ghost'
              disabled={!fields.length}
              onClick={() =>
                change({
                  ...node,
                  items: [
                    ...node.items,
                    {
                      kind: 'condition',
                      path: [fields[0]],
                      operator: '$eq',
                      value: '',
                    },
                  ],
                })
              }
            >
              {t('databasePolicy.addCondition')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() =>
                change({ ...node, items: [...node.items, emptyFilter()] })
              }
            >
              {t('filterEditor.addGroup')}
            </Button>
            {remove ? (
              <Button
                size='sm'
                variant='ghost'
                className='ml-auto'
                aria-label={t('filterEditor.removeGroup')}
                onClick={remove}
              >
                {t('common.remove')}
              </Button>
            ) : null}
          </div>
          <div className='space-y-2'>
            {node.items.map((item, index) => (
              // AST nodes have no UI ids; these controlled inputs follow their tree position.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <div key={index}>
                {render(
                  item,
                  (next) => update(index, next),
                  () =>
                    change({
                      ...node,
                      items: node.items.filter((_, i) => i !== index),
                    }),
                )}
              </div>
            ))}
          </div>
          {!node.items.length ? (
            <p className='text-xs text-muted-foreground'>
              {t('databasePolicy.conditionRequired')}
            </p>
          ) : null}
        </div>
      );
    }
    const removeButton = remove ? (
      <Button
        size='sm'
        variant='ghost'
        aria-label={t('databasePolicy.removeCondition')}
        onClick={remove}
      >
        {t('common.remove')}
      </Button>
    ) : null;
    if (
      node.kind !== 'condition' ||
      node.path.length !== 1 ||
      !operators.includes(node.operator) ||
      (node.value !== null && typeof node.value === 'object')
    )
      return (
        <div className='space-y-2 rounded-md border p-3'>
          <p className='text-xs text-muted-foreground'>
            {t('filterEditor.unsupported')}
          </p>
          <pre className='max-h-40 overflow-auto text-xs'>
            {JSON.stringify(node, null, 2)}
          </pre>
          {removeButton}
        </div>
      );
    return (
      <div className='flex flex-wrap items-start gap-2'>
        <SelectField
          aria-label={t('databasePolicy.filterField')}
          className={`${selectClass} flex-1 basis-28`}
          value={node.path[0]}
          onValueChange={(selectedValue) =>
            change({ ...node, path: [selectedValue] })
          }
          options={[...new Set([...fields, ...node.path])].map((field) => ({
            value: field,
            label: field,
          }))}
        />
        <SelectField
          aria-label={t('databasePolicy.filterOperator')}
          className={selectClass}
          value={node.operator}
          onValueChange={(selectedValue) => {
            const operator = selectedValue as FilterOperator;
            const next: FilterConditionNode = { ...node, operator };
            const { value: oldValue, ...withoutValue } = next;
            change(
              unary.has(operator)
                ? withoutValue
                : { ...next, value: oldValue ?? '' },
            );
          }}
          options={operators.map((operator) => ({
            value: operator,
            label: t(`filterOperators.${operator}`),
          }))}
        />
        {!unary.has(node.operator) ? (
          <div className='flex min-w-0 flex-1 basis-44 gap-2'>
            <SelectField
              aria-label={t('filterEditor.valueType')}
              className={selectClass}
              value={
                node.value === null
                  ? 'null'
                  : typeof node.value === 'number'
                    ? 'number'
                    : typeof node.value === 'boolean'
                      ? 'boolean'
                      : 'string'
              }
              onValueChange={(selectedValue) =>
                change({
                  ...node,
                  value:
                    selectedValue === 'null'
                      ? null
                      : selectedValue === 'number'
                        ? 0
                        : selectedValue === 'boolean'
                          ? false
                          : '',
                })
              }
              options={[
                { value: 'string', label: t('filterEditor.text') },
                { value: 'number', label: t('filterEditor.number') },
                { value: 'boolean', label: t('filterEditor.boolean') },
                { value: 'null', label: 'null' },
              ]}
            />
            {typeof node.value === 'boolean' ? (
              <SelectField
                aria-label={t('databasePolicy.filterValue')}
                className={selectClass}
                value={String(node.value)}
                onValueChange={(selectedValue) =>
                  change({ ...node, value: selectedValue === 'true' })
                }
                options={[
                  { value: 'true', label: 'true' },
                  { value: 'false', label: 'false' },
                ]}
              />
            ) : node.value !== null ? (
              <Input
                aria-label={t('databasePolicy.filterValue')}
                className='min-w-20'
                type={typeof node.value === 'number' ? 'number' : 'text'}
                value={String(node.value ?? '')}
                onChange={(event) => {
                  const value =
                    typeof node.value === 'number'
                      ? Number(event.target.value)
                      : event.target.value;
                  if (typeof value !== 'number' || Number.isFinite(value))
                    change({ ...node, value });
                }}
              />
            ) : null}
          </div>
        ) : null}
        {removeButton}
      </div>
    );
  }
  return render(
    value.kind === 'group'
      ? value
      : { kind: 'group', logic: 'and', items: [value] },
    onChange,
  );
}

export function CustomFilterEditor({
  fields,
  value,
  onChange,
}: {
  fields: readonly string[];
  value: string | { key: string; params?: unknown };
  onChange: (value: { key: string; params: unknown }) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const filter = policyFilter(value);
  const update = (filter: FilterNode): void =>
    onChange({
      key: 'customFilter',
      params: {
        ...(typeof value !== 'string' &&
        value.params &&
        typeof value.params === 'object'
          ? value.params
          : {}),
        filter,
      },
    });
  if (!filter)
    return (
      <div className='space-y-2'>
        <p className='text-sm text-muted-foreground'>
          {t('filterEditor.invalid')}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => update(emptyFilter())}
        >
          {t('filterEditor.start')}
        </Button>
      </div>
    );
  return <FilterEditor fields={fields} value={filter} onChange={update} />;
}
