import {
  Archive,
  Download,
  MailOpen,
  Mail,
  Paperclip,
  Reply,
  Forward,
  Star,
  Trash2,
  PenLine,
} from 'lucide-react';
import type { ReactElement } from 'react';

import type { MailMessage } from '../mail-client.js';
import { Button } from './ui/button.js';

export interface MailConversationViewLabels {
  readonly attachmentCount: (count: number) => string;
  readonly conversation: (count: number) => string;
  readonly loadMore: string;
  readonly noSubject: string;
  readonly selectMessage: string;
  readonly unknownSender: string;
}

export interface MailConversationViewProps {
  readonly labels: MailConversationViewLabels;
  readonly loading?: boolean;
  readonly messages: readonly MailMessage[];
  readonly nextCursor?: string;
  readonly onLoadMore: () => void;
  readonly subject?: string;
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
}: MailConversationViewProps): ReactElement {
  if (messages.length === 0) {
    return (
      <section className='grid min-h-0 place-items-center p-8 text-sm text-muted-foreground'>
        {loading ? null : labels.selectMessage}
      </section>
    );
  }

  return (
    <section aria-busy={loading} className='min-h-0 overflow-y-auto'>
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
                  <div className='flex shrink-0 items-center gap-1'>
                    {message.draft && actions.editDraft ? (
                      <Button
                        aria-label={actionLabels.editDraft}
                        className='size-8 px-0'
                        onClick={() => actions.editDraft?.(message)}
                        variant='ghost'
                      >
                        <PenLine />
                      </Button>
                    ) : null}
                    {!message.draft && actions.reply ? (
                      <Button
                        aria-label={actionLabels.reply}
                        className='size-8 px-0'
                        onClick={() => actions.reply?.(message)}
                        variant='ghost'
                      >
                        <Reply />
                      </Button>
                    ) : null}
                    {!message.draft && actions.forward ? (
                      <Button
                        aria-label={actionLabels.forward}
                        className='size-8 px-0'
                        onClick={() => actions.forward?.(message)}
                        variant='ghost'
                      >
                        <Forward />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={
                        message.read
                          ? actionLabels.markUnread
                          : actionLabels.markRead
                      }
                      className='size-8 px-0'
                      onClick={() => actions.toggleRead(message)}
                      variant='ghost'
                    >
                      {message.read ? <Mail /> : <MailOpen />}
                    </Button>
                    <Button
                      aria-label={
                        message.starred
                          ? actionLabels.unstar
                          : actionLabels.star
                      }
                      className='size-8 px-0'
                      onClick={() => actions.toggleStarred(message)}
                      variant='ghost'
                    >
                      <Star fill={message.starred ? 'currentColor' : 'none'} />
                    </Button>
                    {actions.archive ? (
                      <Button
                        aria-label={actionLabels.archive}
                        className='size-8 px-0'
                        onClick={() => actions.archive?.(message)}
                        variant='ghost'
                      >
                        <Archive />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={actionLabels.delete}
                      className='size-8 px-0'
                      onClick={() => actions.delete(message)}
                      variant='ghost'
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </header>
              <div className='mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground'>
                {plainMessageBody(message)}
              </div>
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
            </article>
          );
        })}
      </div>
    </section>
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
