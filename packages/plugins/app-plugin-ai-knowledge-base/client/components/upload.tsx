import { useRef } from 'react';
import { FileUp, Paperclip, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Input } from './ui/input.js';
import { SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS } from '../providers/types.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

export const defaultDocumentExtensions: readonly string[] = [
  ...SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS,
];

type ComponentTranslate = ReturnType<typeof useKnowledgeBaseComponentTranslate>;

function extensionOf(file: File) {
  const dot = file.name.lastIndexOf('.');
  return dot < 0 ? '' : file.name.slice(dot).toLowerCase();
}

function validateFile(
  file: File | undefined,
  allowedExtensions: readonly string[],
  maxFileSizeBytes: number | undefined,
  t: ComponentTranslate,
) {
  if (!file) return t('Choose a file to upload.');
  if (
    !allowedExtensions
      .map((value) => value.toLowerCase())
      .includes(extensionOf(file))
  ) {
    return t('Choose one of the supported file types: {{types}}.', {
      types: allowedExtensions.join(', '),
    });
  }
  if (maxFileSizeBytes !== undefined && file.size > maxFileSizeBytes) {
    return t('This file exceeds the {{size}} MB upload limit.', {
      size: Math.floor(maxFileSizeBytes / 1024 / 1024),
    });
  }
  return undefined;
}

export function DocumentDropzone({
  file,
  onFileChange,
  disabled = false,
  error,
  allowedExtensions = defaultDocumentExtensions,
  maxFileSizeBytes,
  onFileRejected,
}: {
  file?: File;
  onFileChange: (file?: File) => void;
  disabled?: boolean;
  error?: string;
  allowedExtensions?: readonly string[];
  maxFileSizeBytes?: number;
  onFileRejected?: (message: string) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const ref = useRef<HTMLInputElement>(null);
  const choose = (next: File | undefined) => {
    const message = validateFile(next, allowedExtensions, maxFileSizeBytes, t);
    if (message) {
      onFileChange(undefined);
      onFileRejected?.(message);
      return;
    }
    onFileRejected?.('');
    onFileChange(next);
  };
  const chooseLabel = t('Drop one file or choose one');

  return (
    <div className='space-y-2'>
      <button
        type='button'
        aria-label={file ? t('Replace selected file') : chooseLabel}
        className='flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
        onClick={() => ref.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files[0]);
        }}
        disabled={disabled}
      >
        <FileUp className='size-6' />
        {chooseLabel}
      </button>
      <Input
        ref={ref}
        type='file'
        className='sr-only'
        accept={allowedExtensions.join(',')}
        onChange={(event) => choose(event.target.files?.[0])}
        disabled={disabled}
      />
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
    </div>
  );
}

export function SelectedDocumentFile({
  file,
  onClear,
  disabled = false,
}: {
  file: File;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <div className='flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2'>
      <Paperclip
        aria-hidden='true'
        className='size-3.5 shrink-0 text-muted-foreground'
      />
      <span
        className='min-w-0 flex-1 truncate text-xs text-muted-foreground'
        title={file.name}
      >
        {file.name}
      </span>
      {onClear ? (
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          onClick={onClear}
          aria-label={t('Remove selected file')}
          disabled={disabled}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export function UploadDocumentForm({
  file,
  onFileChange,
  onSubmit,
  submitting = false,
  error,
  success,
  allowedExtensions,
  maxFileSizeBytes,
  onFileRejected,
  formId,
  showSubmitButton = true,
}: {
  file?: File;
  onFileChange: (file?: File) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string;
  success?: string;
  allowedExtensions?: readonly string[];
  maxFileSizeBytes?: number;
  onFileRejected?: (message: string) => void;
  formId?: string;
  showSubmitButton?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <form
      id={formId}
      className='space-y-4'
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <DocumentDropzone
        file={file}
        onFileChange={onFileChange}
        disabled={submitting}
        error={!file && error ? error : undefined}
        allowedExtensions={allowedExtensions}
        maxFileSizeBytes={maxFileSizeBytes}
        onFileRejected={onFileRejected}
      />
      {file ? (
        <SelectedDocumentFile
          file={file}
          onClear={() => onFileChange(undefined)}
          disabled={submitting}
        />
      ) : null}
      {error && file ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('Upload failed')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertTitle>{t('Upload submitted')}</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
      {showSubmitButton ? (
        <Button type='submit' disabled={!file || submitting || !!success}>
          {submitting ? t('Uploading…') : t('Upload document')}
        </Button>
      ) : null}
    </form>
  );
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  title,
  ...props
}: Omit<Parameters<typeof UploadDocumentForm>[0], 'onSubmit'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onSubmit: () => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const formId = 'knowledge-base-upload-form';
  const close = () => {
    if (!props.submitting) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{title ?? t('Upload document')}</DialogTitle>
        </DialogHeader>
        <UploadDocumentForm
          {...props}
          formId={formId}
          showSubmitButton={false}
        />
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={close}
            disabled={props.submitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form={formId}
            disabled={!props.file || props.submitting || !!props.success}
          >
            {props.submitting ? t('Uploading…') : t('Submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
