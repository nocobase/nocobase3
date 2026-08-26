import { useRef, useState } from 'react';
import { CircleHelp, FileUp, Paperclip, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js';
import { Button } from './ui/button.js';
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from './ui/combobox.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Input } from './ui/input.js';
import type { ZipFilenameEncodingOption } from '../providers/index.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

export const defaultDocumentExtensions = [
  '.doc',
  '.docx',
  '.md',
  '.pdf',
  '.txt',
  '.zip',
];

type ComponentTranslate = ReturnType<typeof useKnowledgeBaseComponentTranslate>;

function extensionOf(file: File) {
  const dot = file.name.lastIndexOf('.');
  return dot < 0 ? '' : file.name.slice(dot).toLowerCase();
}

function validateFile(
  file: File | undefined,
  allowedExtensions: string[],
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
  if (maxFileSizeBytes && file.size > maxFileSizeBytes) {
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
  allowedExtensions?: string[];
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

const normalizeZipFilenameEncodings = (items: string[]) =>
  Array.from(
    new Set(
      items
        .flatMap((item) => item.split(/[\s,]+/))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

type ZipFilenameEncodingItem = {
  value: string;
  label: string;
  description?: string;
};

export function ZipFilenameEncodingField({
  values = [],
  options,
  defaultEncoding,
  onValuesChange,
  disabled = false,
}: {
  values?: string[];
  options: ZipFilenameEncodingOption[];
  defaultEncoding?: string;
  onValuesChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const [customValue, setCustomValue] = useState('');
  const normalizedValues = normalizeZipFilenameEncodings(values);
  const encodingItems: ZipFilenameEncodingItem[] = [
    ...options.map(({ value, label, description }) => ({
      value,
      label,
      ...(description ? { description } : {}),
    })),
    ...normalizedValues
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: value })),
  ];
  const selectedItems = normalizedValues.map(
    (value) =>
      encodingItems.find((item) => item.value === value) ?? {
        value,
        label: value,
      },
  );
  const addCustom = (nextValue = customValue) => {
    const nextValues = normalizeZipFilenameEncodings([
      ...normalizedValues,
      nextValue,
    ]);
    if (nextValues.length !== normalizedValues.length)
      onValuesChange(nextValues);
    setCustomValue('');
  };
  const handleCustomValueChange = (nextValue: string) => {
    if (/[\s,]$/.test(nextValue)) {
      addCustom(nextValue);
      return;
    }
    setCustomValue(nextValue);
  };
  const defaultPlaceholder = defaultEncoding
    ? t('Uses UTF-8 and {{encoding}} by default', { encoding: defaultEncoding })
    : t('Uses UTF-8 by default');

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center gap-1 text-base font-semibold'>
        <span>{t('How to read ZIP filenames')}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                aria-label={t('ZIP filename encoding help')}
              />
            }
          >
            <CircleHelp />
          </TooltipTrigger>
          <TooltipContent>
            {t(
              'Choose one or more encodings, or type an encoding name, to decode filenames stored in ZIP archives.',
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      <Combobox
        items={encodingItems}
        multiple
        value={selectedItems}
        isItemEqualToValue={(item, value) => item.value === value.value}
        onValueChange={(nextItems: ZipFilenameEncodingItem[]) => {
          onValuesChange(
            normalizeZipFilenameEncodings(nextItems.map((item) => item.value)),
          );
          setCustomValue('');
        }}
      >
        <ComboboxChips className='min-h-11 rounded-lg border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20'>
          <ComboboxValue>
            {(selected: ZipFilenameEncodingItem[]) => (
              <>
                {selected.map((item) => (
                  <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
                ))}
                <ComboboxChipsInput
                  value={customValue}
                  placeholder={selected.length ? '' : defaultPlaceholder}
                  aria-label={t('ZIP filename encodings')}
                  disabled={disabled}
                  onChange={(event) =>
                    handleCustomValueChange(event.target.value)
                  }
                  onKeyDown={(event) => {
                    const exactOption = encodingItems.some(
                      (item) => item.value === customValue.trim(),
                    );
                    if (
                      customValue.trim() &&
                      (event.key === ',' ||
                        event.key === ' ' ||
                        (event.key === 'Enter' && !exactOption))
                    ) {
                      event.preventDefault();
                      addCustom();
                    }
                  }}
                />
              </>
            )}
          </ComboboxValue>
          <ComboboxTrigger
            render={
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                disabled={disabled}
              />
            }
            aria-label={t('Show ZIP filename encoding options')}
          />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>
            {t('Type an encoding name, then press Enter to add it.')}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: ZipFilenameEncodingItem) => (
              <ComboboxItem
                key={item.value}
                value={item}
                className='data-selected:bg-accent'
              >
                <div className='grid gap-0.5'>
                  <span>{item.label}</span>
                  {item.description ? (
                    <span className='text-xs text-muted-foreground'>
                      {item.description}
                    </span>
                  ) : null}
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

export function UploadDocumentForm({
  file,
  onFileChange,
  zipFilenameEncodings,
  encodingOptions = [],
  defaultZipFilenameEncoding,
  onZipFilenameEncodingsChange,
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
  zipFilenameEncodings?: string[];
  encodingOptions?: ZipFilenameEncodingOption[];
  defaultZipFilenameEncoding?: string;
  onZipFilenameEncodingsChange: (values: string[]) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string;
  success?: string;
  allowedExtensions?: string[];
  maxFileSizeBytes?: number;
  onFileRejected?: (message: string) => void;
  formId?: string;
  showSubmitButton?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const isZip = file?.name.toLowerCase().endsWith('.zip') ?? false;
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
      {isZip ? (
        <ZipFilenameEncodingField
          values={zipFilenameEncodings}
          options={encodingOptions}
          defaultEncoding={defaultZipFilenameEncoding}
          onValuesChange={onZipFilenameEncodingsChange}
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
