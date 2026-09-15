import { LoaderCircle } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/**
 * One bounded column. Its list scrolls inside it rather than lengthening the
 * page, which a connection with hundreds of collections otherwise does.
 *
 * The cap is written against the viewport because the App shell does not give
 * this page a height to divide up: its main region is `min-h-svh` with a
 * content-sized `flex-1` child, so `h-full` here resolves to `auto` and a
 * `flex-1` row grows to fit its longest column. A panel that caps itself needs
 * nothing from the shell and behaves the same stacked on a phone as it does in
 * three columns.
 */
export function Panel({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      aria-label={label}
      className='flex max-h-[70svh] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card'
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <h2 className='truncate border-b border-border px-4 py-3 text-sm font-semibold'>
      {children}
    </h2>
  );
}

export function Loading({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      className='flex items-center gap-2 p-2 text-sm text-muted-foreground'
    >
      <LoaderCircle aria-hidden className='size-4 animate-spin' />
      {label}
    </div>
  );
}

export function Notice({
  tone,
  children,
}: {
  readonly tone: 'destructive' | 'warning';
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role='alert'
      className={[
        'rounded-md border px-3 py-2 text-sm',
        tone === 'destructive'
          ? 'border-destructive text-destructive'
          : 'border-border bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function DataTable({
  caption,
  headers,
  rows,
  empty,
}: {
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly empty: string;
}): ReactElement {
  if (rows.length === 0) {
    return <p className='p-4 text-sm text-muted-foreground'>{empty}</p>;
  }
  return (
    <div className='overflow-x-auto p-4'>
      <table className='w-full border-collapse text-sm'>
        <caption className='sr-only'>{caption}</caption>
        <thead>
          <tr className='border-b border-border text-left'>
            {headers.map((header) => (
              <th key={header} className='px-2 py-2 font-medium'>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className='border-b border-border/60'>
              {headers.map((header, index) => (
                <td
                  key={header}
                  className={
                    index === 0
                      ? 'px-2 py-2 font-medium'
                      : 'px-2 py-2 text-muted-foreground'
                  }
                >
                  {row[index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
