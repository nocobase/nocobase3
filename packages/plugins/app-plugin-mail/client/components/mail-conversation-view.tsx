import {
  Archive,
  CheckSquare2,
  Download,
  Forward,
  Mail,
  MailOpen,
  Paperclip,
  PenLine,
  Reply,
  Star,
  StickyNote,
  Tag,
  Trash2,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { sanitizeMailHtml } from '../lib/mail-template.js';
import type { MailLabel, MailMessage } from '../mail-client.js';
import { Button } from './ui/button.js';
import { MailLabelTag } from './mail-label-tag.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';
import { Textarea } from './ui/textarea.js';

export interface MailConversationViewLabels {
  readonly attachmentCount: (count: number) => string;
  readonly conversation: (count: number) => string;
  readonly loadMore: string;
  readonly noSubject: string;
  readonly selectMessage: string;
  readonly unknownSender: string;
  readonly labels: string;
  readonly note: string;
  readonly notePlaceholder: string;
  readonly saveNote: string;
  readonly todo: string;
  readonly close?: string;
}

export interface MailConversationViewProps {
  readonly labels: MailConversationViewLabels;
  readonly loading?: boolean;
  readonly messages: readonly MailMessage[];
  readonly nextCursor?: string;
  readonly onLoadMore: () => void;
  readonly subject?: string;
  readonly availableLabels?: readonly MailLabel[];
  readonly actions?: {
    readonly archive?: (message: MailMessage) => void;
    readonly delete: (message: MailMessage) => void;
    readonly downloadAttachment?: (
      message: MailMessage,
      attachment: MailMessage['attachments'][number],
    ) => void;
    readonly reply?: (message: MailMessage) => void;
    readonly forward?: (message: MailMessage) => void;
    readonly editDraft?: (message: MailMessage) => void;
    readonly toggleRead: (message: MailMessage) => void;
    readonly toggleStarred: (message: MailMessage) => void;
    readonly toggleTodo?: (message: MailMessage) => void;
    readonly saveNote?: (message: MailMessage, note: string) => void;
    readonly toggleLabel?: (
      message: MailMessage,
      labelId: string,
      assigned: boolean,
    ) => void;
  };
  readonly actionLabels?: {
    readonly archive: string;
    readonly delete: string;
    readonly download: string;
    readonly reply: string;
    readonly forward: string;
    readonly editDraft?: string;
    readonly markRead: string;
    readonly markUnread: string;
    readonly star: string;
    readonly unstar: string;
  };
}

export function MailConversationView({
  labels,
  loading = false,
  messages,
  nextCursor,
  onLoadMore,
  subject,
  actions,
  actionLabels,
  availableLabels = [],
}: MailConversationViewProps): ReactElement {
  if (messages.length === 0) {
    return (
      <section className='grid h-full min-h-0 place-items-center overflow-y-auto p-8 text-sm text-muted-foreground'>
        {loading ? null : labels.selectMessage}
      </section>
    );
  }

  return (
    <section aria-busy={loading} className='h-full min-h-0 overflow-y-auto'>
      <header className='sticky top-0 z-10 border-b bg-background/95 px-5 py-4 backdrop-blur'>
        <h1 className='text-lg font-semibold'>{subject || labels.noSubject}</h1>
        <p className='mt-1 text-xs text-muted-foreground'>
          {labels.conversation(messages.length)}
        </p>
      </header>
      <div className='space-y-3 p-4'>
        {nextCursor ? (
          <Button
            className='w-full'
            disabled={loading}
            onClick={onLoadMore}
            variant='outline'
          >
            {labels.loadMore}
          </Button>
        ) : null}
        {messages.map((message) => {
          const sender = message.from?.name ?? message.from?.address;
          const messageLabels = availableLabels.filter((label) =>
            message.labelIds.includes(label.id),
          );
          return (
            <article
              className='rounded-xl border bg-card p-4 shadow-xs'
              key={message.id}
            >
              <header className='flex items-start gap-3'>
                <span className='grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary'>
                  {sender?.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>
                    {sender || labels.unknownSender}
                  </p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {message.from?.address}
                  </p>
                </div>
                <time className='shrink-0 text-xs text-muted-foreground'>
                  {formatFullDate(message.receivedAt ?? message.sentAt)}
                </time>
                {actions && actionLabels ? (
                  <div className='flex shrink-0 items-center gap-0.5'>
                    {message.draft && actions.editDraft ? (
                      <Button
                        aria-label={actionLabels.editDraft}
                        className='size-7 p-0 [&_svg]:size-4'
                        onClick={() => actions.editDraft?.(message)}
                        variant='ghost'
                      >
                        <PenLine aria-hidden='true' />
                      </Button>
                    ) : null}
                    {!message.draft && actions.reply ? (
                      <Button
                        aria-label={actionLabels.reply}
                        className='size-7 p-0 [&_svg]:size-4'
                        onClick={() => actions.reply?.(message)}
                        variant='ghost'
                      >
                        <Reply aria-hidden='true' />
                      </Button>
                    ) : null}
                    {!message.draft && actions.forward ? (
                      <Button
                        aria-label={actionLabels.forward}
                        className='size-7 p-0 [&_svg]:size-4'
                        onClick={() => actions.forward?.(message)}
                        variant='ghost'
                      >
                        <Forward aria-hidden='true' />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={
                        message.read
                          ? actionLabels.markUnread
                          : actionLabels.markRead
                      }
                      className='size-7 p-0 [&_svg]:size-4'
                      onClick={() => actions.toggleRead(message)}
                      variant='ghost'
                    >
                      {message.read ? (
                        <Mail aria-hidden='true' />
                      ) : (
                        <MailOpen aria-hidden='true' />
                      )}
                    </Button>
                    <Button
                      aria-label={
                        message.starred
                          ? actionLabels.unstar
                          : actionLabels.star
                      }
                      className='size-7 p-0 [&_svg]:size-4'
                      onClick={() => actions.toggleStarred(message)}
                      variant='ghost'
                    >
                      <Star
                        aria-hidden='true'
                        fill={message.starred ? 'currentColor' : 'none'}
                      />
                    </Button>
                    {actions.archive ? (
                      <Button
                        aria-label={actionLabels.archive}
                        className='size-7 p-0 [&_svg]:size-4'
                        onClick={() => actions.archive?.(message)}
                        variant='ghost'
                      >
                        <Archive aria-hidden='true' />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={actionLabels.delete}
                      className='size-7 p-0 [&_svg]:size-4'
                      onClick={() => actions.delete(message)}
                      variant='ghost'
                    >
                      <Trash2 aria-hidden='true' />
                    </Button>
                  </div>
                ) : null}
              </header>
              {messageLabels.length > 0 ? (
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {messageLabels.map((label) => (
                    <MailLabelTag key={label.id} label={label} size='md' />
                  ))}
                </div>
              ) : null}
              <MessageBody message={message} />
              {message.attachments.length > 0 ? (
                <div className='mt-4 border-t pt-3 text-xs text-muted-foreground'>
                  <div className='mb-2 flex items-center gap-2'>
                    <Paperclip aria-hidden='true' className='size-3.5' />
                    {labels.attachmentCount(message.attachments.length)}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {message.attachments.map((attachment) =>
                      actions?.downloadAttachment && actionLabels ? (
                        <Button
                          aria-label={`${actionLabels.download} ${attachment.fileName}`}
                          className='h-auto max-w-full justify-start gap-2 px-3 py-2'
                          key={attachment.id}
                          onClick={() =>
                            actions.downloadAttachment?.(message, attachment)
                          }
                          variant='outline'
                        >
                          <Download className='size-3.5 shrink-0' />
                          <span className='truncate'>
                            {attachment.fileName}
                          </span>
                        </Button>
                      ) : (
                        <span
                          className='inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-2'
                          key={attachment.id}
                        >
                          <Paperclip className='size-3.5 shrink-0' />
                          <span className='truncate'>
                            {attachment.fileName}
                          </span>
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              {actions ? (
                <MessageMetadata
                  actions={actions}
                  availableLabels={availableLabels}
                  key={`${message.id}:${message.note ?? ''}`}
                  labels={labels}
                  message={message}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MessageMetadata({
  actions,
  availableLabels,
  labels,
  message,
}: {
  readonly actions: NonNullable<MailConversationViewProps['actions']>;
  readonly availableLabels: readonly MailLabel[];
  readonly labels: MailConversationViewLabels;
  readonly message: MailMessage;
}): ReactElement {
  const [note, setNote] = useState(message.note ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const assignedLabelCount = availableLabels.filter((label) =>
    message.labelIds.includes(label.id),
  ).length;

  return (
    <div className='mt-3 flex flex-wrap items-center gap-1 border-t pt-3'>
      {actions.saveNote ? (
        <>
          <Button
            aria-expanded={noteOpen}
            aria-haspopup='dialog'
            className='h-7 gap-1.5 px-2 text-xs'
            onClick={() => {
              setNote(message.note ?? '');
              setNoteOpen(true);
            }}
            type='button'
            variant={message.note ? 'outline' : 'ghost'}
          >
            <StickyNote aria-hidden='true' className='size-3.5' />
            {labels.note}
          </Button>
          <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
            <DialogContent
              className='max-w-lg'
              closeLabel={labels.close ?? 'Close'}
            >
              <DialogHeader>
                <DialogTitle>{labels.note}</DialogTitle>
              </DialogHeader>
              <Textarea
                aria-label={labels.note}
                autoFocus
                className='mt-4 min-h-28'
                onChange={(event) => setNote(event.target.value)}
                placeholder={labels.notePlaceholder}
                value={note}
              />
              <DialogFooter>
                <Button
                  disabled={note === (message.note ?? '')}
                  onClick={() => {
                    actions.saveNote?.(message, note);
                    setNoteOpen(false);
                  }}
                  type='button'
                >
                  {labels.saveNote}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      {actions.toggleTodo ? (
        <Button
          aria-pressed={message.todo}
          className='h-7 gap-1.5 px-2 text-xs'
          onClick={() => actions.toggleTodo?.(message)}
          type='button'
          variant={message.todo ? 'default' : 'outline'}
        >
          <CheckSquare2 aria-hidden='true' className='size-3.5' />
          {labels.todo}
        </Button>
      ) : null}
      {availableLabels.length > 0 && actions.toggleLabel ? (
        <>
          <Button
            aria-label={labels.labels}
            aria-expanded={labelsOpen}
            aria-haspopup='dialog'
            className='h-7 gap-1.5 px-2 text-xs'
            onClick={() => setLabelsOpen(true)}
            type='button'
            variant={assignedLabelCount > 0 ? 'outline' : 'ghost'}
          >
            <Tag aria-hidden='true' className='size-3.5' />
            {labels.labels}
            {assignedLabelCount > 0 ? (
              <span className='rounded-full bg-primary/10 px-1.5 text-[11px] text-primary'>
                {assignedLabelCount}
              </span>
            ) : null}
          </Button>
          <Dialog open={labelsOpen} onOpenChange={setLabelsOpen}>
            <DialogContent closeLabel={labels.close ?? 'Close'}>
              <DialogHeader>
                <DialogTitle>{labels.labels}</DialogTitle>
              </DialogHeader>
              <fieldset className='mt-4 grid gap-2'>
                <legend className='sr-only'>{labels.labels}</legend>
                {availableLabels.map((label) => {
                  const assigned = message.labelIds.includes(label.id);
                  return (
                    <label
                      className='flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50'
                      key={label.id}
                    >
                      <input
                        checked={assigned}
                        onChange={(event) =>
                          actions.toggleLabel?.(
                            message,
                            label.id,
                            event.target.checked,
                          )
                        }
                        type='checkbox'
                      />
                      <MailLabelTag label={label} size='md' />
                    </label>
                  );
                })}
              </fieldset>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

function MessageBody({
  message,
}: {
  readonly message: MailMessage;
}): ReactElement {
  if (message.html) {
    return (
      <div
        className='mt-4 max-w-full overflow-x-auto text-sm leading-6 text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_br]:leading-6 [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_table]:max-w-full [&_td]:p-1 [&_th]:p-1 [&_ul]:list-disc'
        // The body is sanitized by sanitizeMailHtml before it reaches the DOM.
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{ __html: sanitizeMailHtml(message.html) }}
      />
    );
  }

  return (
    <div className='mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground'>
      {plainMessageBody(message)}
    </div>
  );
}

function plainMessageBody(message: MailMessage): string {
  if (message.text) return message.text;
  if (message.preview) return message.preview;
  if (!message.html) return '';
  if (typeof DOMParser === 'undefined') {
    return message.html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const document = new DOMParser().parseFromString(message.html, 'text/html');
  for (const element of document.querySelectorAll('script, style')) {
    element.remove();
  }
  return document.body.textContent?.trim() ?? '';
}

function formatFullDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
