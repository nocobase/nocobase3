import {
  Bold,
  Eraser,
  FileText,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  PenLine,
  Redo2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import { htmlToPlainText, sanitizeMailHtml } from '../lib/mail-template.js';
import { Button } from './ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';

export interface MailRichTextValue {
  readonly html: string;
  readonly text: string;
}

export interface MailRichTextEditorLabels {
  readonly toolbar: string;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly bulletList: string;
  readonly numberedList: string;
  readonly undo: string;
  readonly redo: string;
  readonly clearFormatting: string;
  readonly fontSize?: string;
  readonly heading?: string;
  readonly link?: string;
  readonly image?: string;
  readonly normal?: string;
  readonly heading1?: string;
  readonly heading2?: string;
  readonly heading3?: string;
  readonly heading4?: string;
  readonly heading5?: string;
  readonly heading6?: string;
  readonly fontSizeSmall?: string;
  readonly fontSizeNormal?: string;
  readonly fontSizeLarge?: string;
}

export interface MailRichTextEditorInsertOption {
  readonly id: string;
  readonly label: string;
}

export interface MailRichTextEditorInsertMenu {
  readonly label: string;
  readonly options: readonly MailRichTextEditorInsertOption[];
  readonly onSelect: (id: string) => void;
  readonly selectedId?: string;
}

export interface MailRichTextEditorInsertActions {
  readonly signature?: MailRichTextEditorInsertMenu;
  readonly template?: MailRichTextEditorInsertMenu;
}

export interface MailRichTextEditorProps {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly insertActions?: MailRichTextEditorInsertActions;
  readonly labels: MailRichTextEditorLabels;
  readonly onChange: (value: MailRichTextValue) => void;
  readonly placeholder?: string;
  readonly value: string;
}

const COMMANDS = [
  ['bold', Bold, 'bold'],
  ['italic', Italic, 'italic'],
  ['underline', Underline, 'underline'],
  ['insertUnorderedList', List, 'bulletList'],
  ['insertOrderedList', ListOrdered, 'numberedList'],
  ['undo', Undo2, 'undo'],
  ['redo', Redo2, 'redo'],
  ['removeFormat', Eraser, 'clearFormatting'],
] as const;

const FONT_SIZES = [10, 12, 14, 16, 18, 24, 32, 48] as const;

export function MailRichTextEditor({
  ariaLabel,
  disabled = false,
  insertActions,
  labels,
  onChange,
  placeholder,
  value,
}: MailRichTextEditorProps): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);
  const pendingFontSizeRef = useRef('14');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeMailHtml(value);
    if (editor.innerHTML !== sanitized) editor.innerHTML = sanitized;
  }, [value]);

  const emitValue = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    // A collapsed selection applies the command to characters typed afterwards.
    for (const font of editor.querySelectorAll<HTMLElement>('font[size="7"]')) {
      font.style.fontSize = `${pendingFontSizeRef.current}px`;
      font.removeAttribute('size');
    }
    const html = sanitizeMailHtml(editor.innerHTML);
    onChange({ html, text: htmlToPlainText(html) });
  };

  const runCommand = (command: string, value?: string): void => {
    editorRef.current?.focus();
    document.execCommand?.(command, false, value);
    emitValue();
  };

  const setFontSize = (size: string): void => {
    const editor = editorRef.current;
    if (!editor) return;
    pendingFontSizeRef.current = size;
    editor.focus();
    // Reserve the largest legacy size as a marker without changing existing text.
    for (const font of editor.querySelectorAll<HTMLElement>('font[size="7"]')) {
      if (!font.style.fontSize) font.style.fontSize = '48px';
      font.removeAttribute('size');
    }
    document.execCommand?.('styleWithCSS', false, 'false');
    document.execCommand?.('fontSize', false, '7');
    emitValue();
  };

  const insertLink = (): void => {
    const url = window.prompt(labels.link ?? 'Insert link', 'https://');
    if (url?.trim()) runCommand('createLink', url.trim());
  };

  const insertImage = (): void => {
    const url = window.prompt(labels.image ?? 'Insert image', 'https://');
    if (url?.trim()) runCommand('insertImage', url.trim());
  };

  return (
    <div className='overflow-hidden rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'>
      <div
        aria-label={labels.toolbar}
        className='flex flex-wrap items-center gap-1 border-b bg-muted/20 p-1'
        role='toolbar'
      >
        <select
          aria-label={labels.heading ?? 'Heading level'}
          className='h-8 rounded-md border-0 bg-transparent px-1 text-xs'
          defaultValue='p'
          disabled={disabled}
          onChange={(event) => runCommand('formatBlock', event.target.value)}
          title={labels.heading ?? 'Heading level'}
        >
          <option value='p'>{labels.normal ?? 'Normal'}</option>
          <option value='h1'>{labels.heading1 ?? 'Heading 1'}</option>
          <option value='h2'>{labels.heading2 ?? 'Heading 2'}</option>
          <option value='h3'>{labels.heading3 ?? 'Heading 3'}</option>
          <option value='h4'>{labels.heading4 ?? 'Heading 4'}</option>
          <option value='h5'>{labels.heading5 ?? 'Heading 5'}</option>
          <option value='h6'>{labels.heading6 ?? 'Heading 6'}</option>
        </select>
        <select
          aria-label={labels.fontSize ?? 'Font size'}
          className='h-8 rounded-md border-0 bg-transparent px-1 text-xs'
          defaultValue='14'
          disabled={disabled}
          onChange={(event) => setFontSize(event.target.value)}
          title={labels.fontSize ?? 'Font size'}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={String(size)}>
              {size}
            </option>
          ))}
        </select>
        {COMMANDS.map(([command, Icon, label]) => (
          <Button
            aria-label={labels[label]}
            className='size-8 px-0'
            disabled={disabled}
            key={command}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(command)}
            title={labels[label]}
            type='button'
            variant='ghost'
          >
            <Icon aria-hidden='true' className='size-4' />
          </Button>
        ))}
        <Button
          aria-label={labels.link ?? 'Insert link'}
          className='size-8 px-0'
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertLink}
          title={labels.link ?? 'Insert link'}
          type='button'
          variant='ghost'
        >
          <Link2 aria-hidden='true' className='size-4' />
        </Button>
        <Button
          aria-label={labels.image ?? 'Insert image'}
          className='size-8 px-0'
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertImage}
          title={labels.image ?? 'Insert image'}
          type='button'
          variant='ghost'
        >
          <ImagePlus aria-hidden='true' className='size-4' />
        </Button>
        {insertActions ? (
          <span aria-hidden='true' className='mx-1 h-5 w-px bg-border' />
        ) : null}
        {insertActions?.signature ? (
          <MailRichTextInsertMenu
            icon={<PenLine aria-hidden='true' className='size-3.5' />}
            menu={insertActions.signature}
            disabled={disabled}
          />
        ) : null}
        {insertActions?.template ? (
          <MailRichTextInsertMenu
            icon={<FileText aria-hidden='true' className='size-3.5' />}
            menu={insertActions.template}
            disabled={disabled}
          />
        ) : null}
      </div>
      <div
        aria-label={ariaLabel}
        aria-multiline='true'
        className='min-h-48 px-3 py-2 text-[14px] outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&>div]:my-2 [&_p]:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_h1]:my-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:my-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:my-2 [&_h4]:text-lg [&_h4]:font-bold [&_h5]:my-2 [&_h5]:text-base [&_h5]:font-bold [&_h6]:my-2 [&_h6]:text-sm [&_h6]:font-bold'
        contentEditable={!disabled}
        data-placeholder={placeholder}
        onInput={disabled ? undefined : emitValue}
        onPaste={(event) => {
          if (disabled) return;
          event.preventDefault();
          const html = sanitizeMailHtml(
            event.clipboardData.getData('text/html'),
          );
          if (html) document.execCommand?.('insertHTML', false, html);
          else
            document.execCommand?.(
              'insertText',
              false,
              event.clipboardData.getData('text/plain'),
            );
          emitValue();
        }}
        ref={editorRef}
        role='textbox'
        suppressContentEditableWarning
      />
    </div>
  );
}

function MailRichTextInsertMenu({
  disabled = false,
  icon,
  menu,
}: {
  readonly disabled?: boolean;
  readonly icon: ReactElement;
  readonly menu: MailRichTextEditorInsertMenu;
}): ReactElement {
  const menuDisabled = disabled || menu.options.length === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onMouseDown={(event) => event.preventDefault()}
        disabled={menuDisabled}
        render={
          <Button
            aria-label={menu.label}
            className='h-8 px-2 text-xs'
            disabled={menuDisabled}
            title={menu.label}
            type='button'
            variant='ghost'
          />
        }
      >
        {icon}
        <span>{menu.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='max-w-72'>
        {menu.options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => menu.onSelect(option.id)}
          >
            <span
              aria-hidden='true'
              className='flex size-4 shrink-0 items-center justify-center text-primary'
            >
              {menu.selectedId === option.id ? '✓' : null}
            </span>
            <span className='truncate'>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
