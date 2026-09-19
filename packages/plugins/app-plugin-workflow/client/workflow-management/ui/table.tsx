import type {
  HTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
  TableHTMLAttributes,
} from 'react';

import type { ReactElement } from 'react';

export function Table({
  className = '',
  ...props
}: TableHTMLAttributes<HTMLTableElement>): ReactElement {
  return (
    <div className='workflow-table-container'>
      <table className={`workflow-table ${className}`.trim()} {...props} />
    </div>
  );
}

export function TableHeader(
  props: HTMLAttributes<HTMLTableSectionElement>,
): ReactElement {
  return <thead {...props} />;
}

export function TableBody(
  props: HTMLAttributes<HTMLTableSectionElement>,
): ReactElement {
  return <tbody {...props} />;
}

export function TableRow(
  props: HTMLAttributes<HTMLTableRowElement>,
): ReactElement {
  return <tr {...props} />;
}

export function TableHead(
  props: ThHTMLAttributes<HTMLTableCellElement>,
): ReactElement {
  return <th scope='col' {...props} />;
}

export function TableCell(
  props: TdHTMLAttributes<HTMLTableCellElement>,
): ReactElement {
  return <td {...props} />;
}
