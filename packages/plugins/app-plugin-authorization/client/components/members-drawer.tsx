import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import type {
  AuthorizationSubject,
  SubjectPage,
} from '../authorization-client.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { useAuthorizationClient } from '../use-authorization-client.js';
import { ErrorBox, errorMessage } from './feedback.js';
import { SearchField } from './filters.js';
import { EmptyTableRow, ManagementTable } from './management-ui.js';
import { RuleDrawer } from './rule-drawer.js';
import { Button } from './ui/button.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js';
import { useSettingsActions } from './use-settings-actions.js';

const PAGE_SIZE = 30;
const INSPECTOR_PATH = '/settings/authorization/inspector';

/** The users a subject contains, read-only, paged by the server. */
export function MembersDrawer({
  settings,
  subject,
  title,
  typeLabel,
  manage,
  onClose,
}: {
  /** The surface whose `subjects` routes answer, such as `permission-sets`. */
  settings: string;
  subject: AuthorizationSubject;
  title: string;
  typeLabel: string;
  manage?: string;
  onClose: () => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const authz = useAuthorizationClient();
  const canInspect = useSettingsActions('authorization.inspector').inspect;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SubjectPage & { key: string }>();
  const [error, setError] = useState<{ key: string; message: string }>();
  const queryKey = JSON.stringify([subject, search, page]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void authz
        .listSubjectMembers(settings, subject.type, subject.id, {
          ...(search ? { search } : {}),
          page,
          pageSize: PAGE_SIZE,
        })
        .then(
          (data) => {
            if (!current) return;
            setResult({ ...data, key: queryKey });
            setError(undefined);
          },
          (cause: unknown) => {
            if (current)
              setError({ key: queryKey, message: errorMessage(t, cause) });
          },
        );
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [authz, settings, subject, search, page, queryKey, t]);
  const data = result?.key === queryKey ? result : undefined;
  const failed = error?.key === queryKey ? error.message : undefined;
  return (
    <RuleDrawer
      title={`${title} · ${typeLabel}`}
      description={t('members.hint')}
      actions={
        manage ? (
          <Link
            className='inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
            to={manage}
          >
            {t('members.manage')}
          </Link>
        ) : null
      }
      onClose={onClose}
    >
      <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-6'>
        <SearchField
          className='sm:max-w-none'
          label={t('members.search')}
          placeholder={t('members.search')}
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        {failed ? <ErrorBox value={failed} /> : null}
        <ManagementTable>
          <Table aria-busy={!data && !failed}>
            <TableHeader className='bg-muted/30'>
              <TableRow>
                <TableHead className='px-5 py-3 font-medium'>
                  {t('members.name')}
                </TableHead>
                <TableHead className='px-5 py-3 font-medium'>
                  {t('members.description')}
                </TableHead>
                {canInspect ? <TableHead className='w-24 px-5 py-3' /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className='px-5 py-3 font-medium'>
                    {member.title}
                  </TableCell>
                  <TableCell className='px-5 py-3 text-muted-foreground'>
                    {member.description ?? ''}
                  </TableCell>
                  {canInspect ? (
                    <TableCell className='px-5 py-3 text-right'>
                      <Link
                        aria-label={t('members.inspectNamed', {
                          label: member.title,
                        })}
                        className='text-sm text-primary hover:underline'
                        to={`${INSPECTOR_PATH}?${new URLSearchParams({
                          subjectType: 'user',
                          subjectId: member.id,
                        }).toString()}`}
                      >
                        {t('members.inspect')}
                      </Link>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {data && data.items.length === 0 ? (
                <EmptyTableRow colSpan={canInspect ? 3 : 2}>
                  {t(search ? 'members.emptyFiltered' : 'members.empty')}
                </EmptyTableRow>
              ) : null}
              {!data && !failed ? (
                <EmptyTableRow colSpan={canInspect ? 3 : 2}>
                  {t('common.loading')}
                </EmptyTableRow>
              ) : null}
            </TableBody>
          </Table>
        </ManagementTable>
        <div className='flex items-center justify-between gap-2 text-sm text-muted-foreground'>
          <span>{data ? t('members.total', { count: data.total }) : null}</span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              disabled={page === 1}
              onClick={() => setPage((old) => old - 1)}
            >
              {t('subjects.previous')}
            </Button>
            <Button
              variant='outline'
              disabled={!data || page * PAGE_SIZE >= data.total}
              onClick={() => setPage((old) => old + 1)}
            >
              {t('subjects.next')}
            </Button>
          </div>
        </div>
      </div>
    </RuleDrawer>
  );
}
