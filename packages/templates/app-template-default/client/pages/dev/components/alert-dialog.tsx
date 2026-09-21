import { useTranslation } from '@nocobase/i18n/client';
import { Share2Icon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { ExamplePage, ExampleSection } from '../shared';

export default function AlertDialogExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const handleDelete = (): void => {
    setDeleting(true);
    // Stands in for the request a real page would await before closing.
    window.setTimeout(() => {
      setDeleting(false);
      setDeleteOpen(false);
    }, 1200);
  };

  return (
    <ExamplePage
      title={t('devComponents.alertDialog.title')}
      description={t('devComponents.alertDialog.description')}
      source='client/pages/dev/components/alert-dialog.tsx'
      docs='https://ui.shadcn.com/docs/components/alert-dialog'
    >
      <ExampleSection
        title={t('devComponents.alertDialog.basic')}
        description={t('devComponents.alertDialog.basicDescription')}
      >
        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogTrigger render={<Button variant='outline' />}>
            {t('devComponents.alertDialog.archiveProject')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('devComponents.alertDialog.archiveTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('devComponents.alertDialog.archiveDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('devCommon.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => setArchiveOpen(false)}>
                {t('devComponents.alertDialog.archive')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alertDialog.small')}
        description={t('devComponents.alertDialog.smallDescription')}
      >
        <AlertDialog open={sendOpen} onOpenChange={setSendOpen}>
          <AlertDialogTrigger render={<Button variant='outline' />}>
            {t('devComponents.alertDialog.sendInvoice')}
          </AlertDialogTrigger>
          <AlertDialogContent size='sm'>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('devComponents.alertDialog.sendTitle', {
                  invoice: 'INV-2031',
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('devComponents.alertDialog.sendDescription', {
                  email: 'billing@acme.com',
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('devComponents.alertDialog.notNow')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => setSendOpen(false)}>
                {t('devComponents.alertDialog.send')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alertDialog.withMedia')}
        description={t('devComponents.alertDialog.withMediaDescription')}
      >
        <AlertDialog open={shareOpen} onOpenChange={setShareOpen}>
          <AlertDialogTrigger render={<Button variant='outline' />}>
            <Share2Icon data-icon='inline-start' />
            {t('devCommon.share')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Share2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {t('devComponents.alertDialog.shareTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('devComponents.alertDialog.shareDescription', {
                  team: 'Finance',
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('devCommon.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => setShareOpen(false)}>
                {t('devCommon.share')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alertDialog.destructive')}
        description={t('devComponents.alertDialog.destructiveDescription')}
      >
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!deleting) setDeleteOpen(open);
          }}
        >
          <AlertDialogTrigger render={<Button variant='destructive' />}>
            <Trash2Icon data-icon='inline-start' />
            {t('devComponents.alertDialog.deleteCustomer')}
          </AlertDialogTrigger>
          <AlertDialogContent size='sm'>
            <AlertDialogHeader>
              <AlertDialogMedia className='bg-destructive/10 text-destructive dark:bg-destructive/20'>
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {t('devComponents.alertDialog.deleteTitle', {
                  customer: 'Acme Inc.',
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('devComponents.alertDialog.deleteDescription', {
                  count: 24,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t('devCommon.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? <Spinner data-icon='inline-start' /> : null}
                {deleting
                  ? t('devComponents.alertDialog.deleting')
                  : t('devCommon.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.alertDialog.withoutTrigger')}
        description={t('devComponents.alertDialog.withoutTriggerDescription')}
      >
        <Button variant='outline' onClick={() => setDiscardOpen(true)}>
          {t('devComponents.alertDialog.leavePage')}
        </Button>
        <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialogContent size='sm'>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('devComponents.alertDialog.discardTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('devComponents.alertDialog.discardDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('devComponents.alertDialog.keepEditing')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={() => setDiscardOpen(false)}
              >
                {t('devComponents.alertDialog.discard')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ExampleSection>
    </ExamplePage>
  );
}
