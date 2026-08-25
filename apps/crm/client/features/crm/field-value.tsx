import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CrmFieldConfig } from './resource-config';
import { asRecord, toScalarString } from './data';
import {
  currencyFormatter,
  dateFormatter,
  dateTimeFormatter,
  numberFormatter,
  toneClasses,
} from './formatters';

const formatDate = (value: unknown, includeTime = false) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return (includeTime ? dateTimeFormatter : dateFormatter).format(date);
};

export function FieldValue({
  field,
  record,
  className,
}: {
  field: CrmFieldConfig;
  record: Record<string, unknown>;
  className?: string;
}) {
  const value = record[field.name];

  if (field.kind === 'relation' && field.relation) {
    const related = asRecord(record[field.relation.relationName]);
    const label = related?.[field.relation.labelField];
    return (
      <span className={cn('font-medium text-foreground', className)}>
        {typeof label === 'string' || typeof label === 'number'
          ? String(label)
          : '—'}
      </span>
    );
  }

  if (field.kind === 'select') {
    const choice = field.options?.find((option) => option.value === value);
    return choice ? (
      <Badge
        variant='outline'
        className={cn('font-medium', toneClasses[choice.tone], className)}
      >
        {choice.label}
      </Badge>
    ) : (
      <span className={cn('text-muted-foreground', className)}>—</span>
    );
  }

  if (field.kind === 'date' || field.kind === 'datetime') {
    return (
      <span className={className}>
        {formatDate(value, field.kind === 'datetime')}
      </span>
    );
  }

  if (field.kind === 'number' || field.kind === 'percent') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return <span className={className}>—</span>;
    const formatted =
      field.name === 'amount'
        ? currencyFormatter.format(numeric)
        : `${numberFormatter.format(numeric)}${field.kind === 'percent' ? '%' : ''}`;
    return <span className={cn('tabular-nums', className)}>{formatted}</span>;
  }

  if (field.kind === 'url' && typeof value === 'string' && value) {
    return (
      <a
        href={value}
        target='_blank'
        rel='noreferrer'
        className={cn(
          'text-primary underline-offset-4 hover:underline',
          className,
        )}
      >
        {value}
      </a>
    );
  }

  if (field.kind === 'email' && typeof value === 'string' && value) {
    return (
      <a
        href={`mailto:${value}`}
        className={cn(
          'text-primary underline-offset-4 hover:underline',
          className,
        )}
      >
        {value}
      </a>
    );
  }

  if (value === null || value === undefined || value === '') {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }

  return (
    <span
      className={cn(
        field.kind === 'textarea' && 'whitespace-pre-wrap',
        className,
      )}
    >
      {toScalarString(value, '—')}
    </span>
  );
}
