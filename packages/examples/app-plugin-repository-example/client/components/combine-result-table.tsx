import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js';

const NS = '@nocobase/app-plugin-repository-example';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Flatten objects into field paths; keep record arrays together in their parent cell. */
function flatten(
  record: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return isRecord(value) && Object.keys(value).length
        ? Object.entries(flatten(value, path))
        : [[path, value]];
    }),
  );
}

function CellValue({
  value,
  label,
}: {
  readonly value: unknown;
  readonly label: string;
}): ReactElement {
  const { t } = useTranslation(NS);
  if (value === null)
    return <code className='text-muted-foreground'>NULL</code>;
  if (value === undefined)
    return <span className='text-muted-foreground'>—</span>;
  if (Array.isArray(value)) {
    if (!value.length)
      return (
        <span className='text-muted-foreground'>{t('combineNoRelated')}</span>
      );
    if (value.every(isRecord))
      return <CombineResultTable rows={value} label={label} />;
    return <code>{JSON.stringify(value)}</code>;
  }
  return (
    <span>
      {typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value)}
    </span>
  );
}

export function CombineResultTable({
  rows,
  label,
}: {
  readonly rows: readonly Record<string, unknown>[];
  readonly label: string;
}): ReactElement {
  const flattened = rows.map((row) => flatten(row));
  const columns = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
  return (
    <div className='min-w-0 rounded-md border'>
      <Table aria-label={label}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} scope='col'>
                <code className='text-xs'>{column}</code>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flattened.map((row, index) => (
            <TableRow
              key={typeof row.id === 'string' ? row.id : JSON.stringify(row)}
            >
              {columns.map((column) => (
                <TableCell key={column} className='align-top'>
                  <CellValue
                    value={row[column]}
                    label={`${label} / ${typeof row.id === 'string' ? row.id : index + 1} / ${column}`}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
