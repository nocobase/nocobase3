import { Archive, CloudUpload } from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { type ChangeEvent, type ReactElement } from 'react';
import type { AppDetail } from './types.js';
import { Empty, AppDialog } from './shared.js';
import { formatDate, formatBytes } from './utils.js';

export function Releases({
  app,
  selected,
  onSelect,
  onUpload,
}: {
  readonly app: AppDetail;
  readonly selected: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly onUpload: () => void;
}): ReactElement {
  return (
    <div>
      <div className='mb-5 flex items-center justify-between'>
        <div>
          <h2 className='font-semibold'>Releases</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Upload and inspect immutable release artifacts for this application.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button onClick={onUpload} variant='outline'>
            <CloudUpload className='size-4' /> Upload release
          </Button>
        </div>
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
                    Active
                  </Badge>
                ) : null}
              </span>
              <span className='text-muted-foreground'>
                {formatBytes(item.size)}
              </span>
              <span className='text-muted-foreground'>
                {formatDate(item.createdAt)}
              </span>
            </Button>
          ))
        ) : (
          <Empty icon={<Archive />} title='No releases uploaded' />
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
  return (
    <AppDialog
      title='Upload release'
      description='Upload a built application artifact. Version and config.example.yml or config.example.yaml are detected automatically.'
      onClose={onClose}
    >
      <Button
        className='h-auto min-h-28 w-full flex-col gap-2 border-dashed'
        render={<label className='cursor-pointer' />}
        variant='outline'
      >
        <CloudUpload className='size-5' />
        <span>{artifact?.name ?? 'Choose a .tar.gz release artifact'}</span>
        <Input
          accept='.gz,.tgz,application/gzip'
          className='sr-only'
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onArtifact(event.target.files?.[0])
          }
          type='file'
        />
      </Button>
      <div className='mt-6 flex justify-end gap-2'>
        <Button onClick={onClose} variant='outline'>
          Cancel
        </Button>
        <Button disabled={!artifact || busy} onClick={onUpload}>
          {busy ? 'Uploading…' : 'Upload release'}
        </Button>
      </div>
    </AppDialog>
  );
}
