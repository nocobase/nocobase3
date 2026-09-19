import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { explorerErrorMessage } from '../lib/errors.js';
import { physicalColumns } from '../lib/fields.js';
import { useResource } from '../lib/use-resource.js';
import type { CollectionPaneContext } from './database-explorer-page.js';
import { DataTable, Loading, Notice } from './parts.js';

/**
 * The Physical columns pane.
 *
 * Its own request, made only when this route is open: the physical schema
 * costs a second full inspection of the same table, which would otherwise be
 * paid on every Collection a viewer clicks for a pane most never open.
 */
export default function CollectionColumnsPane(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-database-explorer');
  const { connection, collection, explorer } =
    useOutletContext<CollectionPaneContext>();

  const key =
    connection === undefined || collection === undefined
      ? undefined
      : JSON.stringify([connection, collection]);
  const physical = useResource(
    key,
    useCallback(
      (selection: string) => {
        const [name, table] = JSON.parse(selection) as [string, string];
        return explorer.physicalCollection(name, table);
      },
      [explorer],
    ),
  );

  if (physical.error) {
    return (
      <div className='p-4'>
        <Notice tone='destructive'>
          {explorerErrorMessage(physical.error, t)}
        </Notice>
      </div>
    );
  }
  if (!physical.value) {
    return (
      <div className='p-4'>
        <Loading label={t('states.loading')} />
      </div>
    );
  }

  return (
    <DataTable
      caption={t('tabs.columns')}
      headers={[
        t('columns.name'),
        t('columns.nativeType'),
        t('columns.nullable'),
        t('columns.length'),
        t('columns.collation'),
      ]}
      rows={physicalColumns(physical.value).map((column) => [
        column.columnName,
        column.nativeType,
        column.nullable ? t('labels.yes') : t('labels.no'),
        column.length === undefined ? '' : String(column.length),
        column.collation ?? '',
      ])}
      empty={t('empty.columns')}
    />
  );
}
