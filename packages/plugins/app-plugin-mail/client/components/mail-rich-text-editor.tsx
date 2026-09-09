import {
  Bold,
  Eraser,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import { htmlToPlainText, sanitizeMailHtml } from '../lib/mail-template.js';
import { Button } from './ui/button.js';

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
}

export interface MailRichTextEditorProps {
  readonly ariaLabel: string;
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

export function MailRichTextEditor({
  ariaLabel,
  labels,
  onChange,
  placeholder,
  value,
}: MailRichTextEditorProps): ReactElement {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeMailHtml(value);
    if (editor.innerHTML !== sanitized) editor.innerHTML = sanitized;
  }, [value]);

  const emitValue = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = sanitizeMailHtml(editor.innerHTML);
    onChange({ html, text: htmlToPlainText(html) });
  };

  const runCommand = (command: string): void => {
    editorRef.current?.focus();
    document.execCommand?.(command, false);
    emitValue();
  };

  return (
    <div className='overflow-hidden rounded-lg border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'>
      <div
        aria-label={labels.toolbar}
        className='flex flex-wrap gap-1 border-b bg-muted/20 p-1'
        role='toolbar'
      >
        {COMMANDS.map(([command, Icon, label]) => (
          <Button
            aria-label={labels[label]}
            className='size-8 px-0'
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
      </div>
      <div
        aria-label={ariaLabel}
        aria-multiline='true'
        className='min-h-48 px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]'
        contentEditable
        data-placeholder={placeholder}
        onInput={emitValue}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand?.('insertText', false, text);
          emitValue();
        }}
        ref={editorRef}
        role='textbox'
        suppressContentEditableWarning
      />
    </div>
  );
}
