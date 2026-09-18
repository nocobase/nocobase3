import { Archive, CloudUpload } from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from 'react';
import type { AppDetail } from './types.js';
import { Empty, AppDialog } from './shared.js';
import { formatDate, formatBytes } from './utils.js';

export function Releases({
  app,
  selected,
  canUpload,
  onSelect,
  onUpload,
}: {
  readonly app: AppDetail;
  readonly selected: string | undefined;
  readonly canUpload: boolean;
  readonly onSelect: (id: string) => void;
  readonly onUpload: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation('@nocobase/app-plugin-hub');
  return (
    <div>
      <div className='mb-5 flex items-center justify-between'>
        <div>
          <h2 className='font-semibold'>
            {t('releases.title', { defaultValue: 'Releases' })}
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('releases.description', {
              defaultValue:
                'Upload and inspect immutable release artifacts for this application.',
            })}
          </p>
        </div>
        {canUpload ? (
          <div className='flex gap-2'>
            <Button onClick={onUpload} variant='outline'>
              <CloudUpload className='size-4' />{' '}
              {t('releases.upload', { defaultValue: 'Upload release' })}
            </Button>
          </div>
        ) : null}
      </div>
      <div className='overflow-hidden rounded-xl border'>
        {app.releases.length ? (
          app.releases.map((item) => (
            <Button
              className={`grid h-auto w-full grid-cols-[minmax(0,1fr)_120px_140px] justify-stretch rounded-none border-b px-4 py-3 text-left text-sm last:border-0 ${selected === item.id ? 'bg-primary/5' : ''}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              variant='ghost'
            >
              <span className='flex items-center gap-3'>
                <Archive className='size-4 text-muted-foreground' />
                <span>
                  <span className='block font-medium'>v{item.version}</span>
                  <span className='font-mono text-[11px] text-muted-foreground'>
                    {item.checksum.slice(0, 12)}
                  </span>
                </span>
                {item.id === app.deployment.observedReleaseId ? (
                  <Badge className='bg-emerald-500/10 text-emerald-700'>
                    {t('releases.active', { defaultValue: 'Active' })}
                  </Badge>
                ) : null}
              </span>
              <span className='text-muted-foreground'>
                {formatBytes(item.size)}
              </span>
              <span className='text-muted-foreground'>
                {formatDate(item.createdAt, i18n.language)}
              </span>
            </Button>
          ))
        ) : (
          <Empty
            icon={<Archive />}
            title={t('releases.noReleases', {
              defaultValue: 'No releases uploaded',
            })}
          />
        )}
      </div>
    </div>
  );
}

export function UploadReleaseDialog({
  artifact,
  busy,
  onArtifact,
  onClose,
  onUpload,
}: {
  readonly artifact: File | undefined;
  readonly busy: boolean;
  readonly onArtifact: (file: File | undefined) => void;
  readonly onClose: () => void;
  readonly onUpload: () => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  const [dragging, setDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const [selectionError, setSelectionError] = useState(false);
  const selectFiles = (files: FileList | readonly File[]): void => {
    if (busy || files.length === 0) return;
    const file = files[0];
    if (files.length !== 1 || !file || !/\.(tar\.gz|tgz)$/i.test(file.name)) {
      setSelectionError(true);
      return;
    }
    setSelectionError(false);
    onArtifact(file);
  };
  useEffect(() => {
    // A file dropped beside the zone would otherwise leave the Hub to open or download it, losing this dialog, so
    // every drop while it is open is claimed here and only the zone acts on one.
    const claim = (event: Event): void => {
      if (
        carriesFiles(
          (event as Event & { dataTransfer?: DataTransfer }).dataTransfer,
        )
      ) {
        event.preventDefault();
      }
    };
    document.addEventListener('dragover', claim);
    document.addEventListener('drop', claim);
    return () => {
      document.removeEventListener('dragover', claim);
      document.removeEventListener('drop', claim);
    };
  }, []);
  return (
    <AppDialog
      title={t('releases.uploadTitle', { defaultValue: 'Upload release' })}
      description={t('releases.uploadDescription', {
        defaultValue:
          'Upload a built application artifact. Version and config.example.yml or config.example.yaml are detected automatically.',
      })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} variant='outline'>
            {t('releases.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button disabled={!artifact || busy} onClick={onUpload}>
            {busy
              ? t('releases.uploading', { defaultValue: 'Uploading…' })
              : t('releases.upload', { defaultValue: 'Upload release' })}
          </Button>
        </>
      }
    >
      <label
        className={`relative flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm focus-within:ring-2 focus-within:ring-ring ${busy ? 'cursor-not-allowed opacity-50' : ''} ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
        onDragEnter={(event: DragEvent<HTMLElement>) => {
          if (!carriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          dragDepthRef.current += 1;
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragging(false);
        }}
        onDragOver={(event: DragEvent<HTMLElement>) => {
          if (!carriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
          if (!busy) setDragging(true);
        }}
        onDrop={(event: DragEvent<HTMLElement>) => {
          if (!carriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          dragDepthRef.current = 0;
          setDragging(false);
          selectFiles(event.dataTransfer.files);
        }}
      >
        <CloudUpload className='size-5' />
        <span className='max-w-full break-all text-center'>
          {dragging
            ? t('releases.dropArtifact', {
                defaultValue: 'Drop to select this artifact',
              })
            : (artifact?.name ??
              t('releases.chooseArtifact', {
                defaultValue: 'Click or drag a .tar.gz / .tgz artifact here',
              }))}
        </span>
        <span className='text-center text-xs text-muted-foreground'>
          {t('releases.selectionHint', {
            defaultValue:
              'Select one file, then click Upload release to submit.',
          })}
        </span>
        <Input
          accept='.tar.gz,.tgz'
          aria-label={t('releases.chooseArtifact', {
            defaultValue: 'Click or drag a .tar.gz / .tgz artifact here',
          })}
          className='absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed'
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (event.target.files) selectFiles(event.target.files);
            event.target.value = '';
          }}
          type='file'
        />
      </label>
      {selectionError && (
        <p role='alert' className='mt-2 text-sm text-destructive'>
          {t('releases.invalidSelection', {
            defaultValue: 'Select exactly one .tar.gz or .tgz file.',
          })}
        </p>
      )}
    </AppDialog>
  );
}

/** A drop only means an artifact when it carries files; text and links belong to the browser. */
function carriesFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  return Boolean(dataTransfer?.types?.includes('Files'));
}
