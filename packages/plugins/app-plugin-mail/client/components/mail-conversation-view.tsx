import { Paperclip } from 'lucide-react';
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
}

export function MailConversationView({
  labels,
  loading = false,
  messages,
  nextCursor,
  onLoadMore,
  subject,
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
              </header>
              <div className='mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground'>
                {plainMessageBody(message)}
              </div>
              {message.attachments.length > 0 ? (
                <div className='mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground'>
                  <Paperclip aria-hidden='true' className='size-3.5' />
                  {labels.attachmentCount(message.attachments.length)}
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
