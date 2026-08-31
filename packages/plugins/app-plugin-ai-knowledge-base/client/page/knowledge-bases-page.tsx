import { useState, type ReactElement } from 'react';
import { useNotification } from '@refinedev/core';
import { ChevronDown, Ellipsis, Plus, Settings, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import { Button } from '../components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
import { Switch } from '../components/ui/switch.js';
import {
  KnowledgeBaseCardGrid,
  KnowledgeBaseDirectoryEmpty,
  KnowledgeBaseDirectoryError,
  KnowledgeBaseDirectorySkeleton,
  PagePagination,
} from '../components/index.js';
import { useKnowledgeBase } from '../hooks/index.js';
import { useKnowledgeBaseService } from '../providers/context.js';
import type { KnowledgeBase, KnowledgeBaseType } from '../providers/types.js';
import { knowledgeBaseLiveRoutes } from '../knowledge-base-routes.js';
import { useT } from '../locales/index.js';
import { liveLocationPath } from './url-state.js';
import { KnowledgeBaseEditorSheet } from './knowledge-base-editor-sheet.js';
import { notifyKnowledgeBaseMutationError } from './notifications.js';

const pageSize = 20;

export default function LiveKnowledgeBasesPage(): ReactElement {
  const t = useT();
  const { open: notify } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const service = useKnowledgeBaseService();
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createType, setCreateType] = useState<KnowledgeBaseType>('LOCAL');
  const [editing, setEditing] = useState<KnowledgeBase>();
  const [deleting, setDeleting] = useState<KnowledgeBase>();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const knowledgeBase = useKnowledgeBase({
    directory: { mode: 'paginated', page, pageSize },
  });
  const directory = knowledgeBase.directory.paginated;
  const rows = directory.data?.rows ?? [];

  const setPending = (record: KnowledgeBase, pending: boolean): void => {
    setPendingIds((current) => {
      const next = new Set(current);
      const id = String(record.id);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const updateEnabled = async (
    record: KnowledgeBase,
    enabled: boolean,
  ): Promise<void> => {
    if (pendingIds.has(String(record.id))) return;
    setPending(record, true);
    try {
      await service.updateKnowledgeBase(record.id, { enabled });
      notify?.({
        type: 'success',
        message: enabled
          ? t('Knowledge base enabled')
          : t('Knowledge base disabled'),
      });
      directory.retry();
    } catch (error) {
      notifyKnowledgeBaseMutationError(
        notify,
        t('Unable to update knowledge base'),
        error,
        t('Unable to update knowledge base'),
      );
    } finally {
      setPending(record, false);
    }
  };

  const deleteKnowledgeBase = async (): Promise<void> => {
    const record = deleting;
    if (!record || pendingIds.has(String(record.id))) return;
    setPending(record, true);
    try {
      await service.deleteKnowledgeBase(record.id);
      notify?.({ type: 'success', message: t('Knowledge base deleted') });
      setDeleting(undefined);
      if (rows.length === 1 && page > 1) setPage((current) => current - 1);
      else directory.retry();
    } catch (error) {
      notifyKnowledgeBaseMutationError(
        notify,
        t('Unable to delete knowledge base'),
        error,
        t('Unable to delete knowledge base'),
      );
    } finally {
      setPending(record, false);
    }
  };

  if (directory.loading && !directory.data) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <KnowledgeBaseDirectorySkeleton />
      </main>
    );
  }
  if (directory.error && !directory.data) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <KnowledgeBaseDirectoryError
          error={directory.error}
          onRetry={directory.retry}
        />
      </main>
    );
  }

  return (
    <main className='space-y-3 px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
      <header className='flex justify-end'>
        <div onMouseEnter={() => setCreateMenuOpen(true)}>
          <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
            <DropdownMenuTrigger
              render={<Button type='button' aria-label={t('Add new')} />}
            >
              <Plus aria-hidden='true' />
              {t('Add new')}
              <ChevronDown aria-hidden='true' />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              className='w-(--anchor-width) min-w-0'
            >
              {(['LOCAL', 'READONLY', 'EXTERNAL'] as const).map((type) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() => {
                    setCreateType(type);
                    setEditing(undefined);
                    setEditorOpen(true);
                    setCreateMenuOpen(false);
                  }}
                >
                  {t(
                    type === 'LOCAL'
                      ? 'Local'
                      : type === 'READONLY'
                        ? 'Read-only'
                        : 'External',
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!rows.length ? (
        <KnowledgeBaseDirectoryEmpty />
      ) : (
        <section className='space-y-4'>
          <KnowledgeBaseCardGrid
            items={rows}
            onItemOpen={(item) =>
              navigate(knowledgeBaseLiveRoutes.workspace(item.key), {
                state: { from: liveLocationPath(location) },
              })
            }
            renderMenu={(item) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('Knowledge base actions')}
                    />
                  }
                >
                  <Ellipsis aria-hidden='true' />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-36'>
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(item);
                      setEditorOpen(true);
                    }}
                  >
                    <Settings aria-hidden='true' />
                    {t('Settings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 aria-hidden='true' />
                    {t('Delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            renderEnabledControl={(item) => (
              <Switch
                checked={item.enabled}
                disabled={pendingIds.has(String(item.id))}
                aria-label={
                  item.enabled
                    ? t('Disable knowledge base')
                    : t('Enable knowledge base')
                }
                onCheckedChange={(enabled) => void updateEnabled(item, enabled)}
              />
            )}
          />
          {(directory.data?.count ?? 0) > pageSize ? (
            <PagePagination
              page={directory.data?.page ?? page}
              pageSize={pageSize}
              total={directory.data?.count ?? 0}
              onPageChange={setPage}
            />
          ) : null}
        </section>
      )}

      <KnowledgeBaseEditorSheet
        open={editorOpen}
        record={editing}
        knowledgeBaseType={createType}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(undefined);
        }}
        onSaved={directory.retry}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete knowledge base?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This permanently deletes the knowledge base, its documents, segments, and vectors.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={!!deleting && pendingIds.has(String(deleting.id))}
              onClick={() => void deleteKnowledgeBase()}
            >
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
