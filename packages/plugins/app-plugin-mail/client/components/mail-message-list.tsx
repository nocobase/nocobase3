import { Paperclip, Star } from 'lucide-react';
import type { ReactElement } from 'react';

import type { MailMessageSummary } from '../mail-client.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';

export interface MailMessageListLabels {
  readonly empty: string;
  readonly loadMore: string;
  readonly noSubject: string;
  readonly unknownSender: string;
}

export interface MailMessageListProps {
  readonly labels: MailMessageListLabels;
  readonly loading?: boolean;
  readonly messages: readonly MailMessageSummary[];
  readonly nextCursor?: string;
  readonly onLoadMore: () => void;
  readonly onSelect: (message: MailMessageSummary) => void;
  readonly selectedMessageId?: string;
}

export function MailMessageList({
  labels,
  loading = false,
  messages,
  nextCursor,
  onLoadMore,
  onSelect,
  selectedMessageId,
}: MailMessageListProps): ReactElement {
  return (
    <section
      aria-busy={loading}
      aria-label='Messages'
      className='min-h-0 overflow-y-auto border-b lg:border-r lg:border-b-0'
    >
      {messages.length === 0 && !loading ? (
        <p className='p-8 text-center text-sm text-muted-foreground'>
          {labels.empty}
        </p>
      ) : null}
      <div className='divide-y'>
        {messages.map((message) => {
          const sender = message.from?.name ?? message.from?.address;
          return (
            <button
              aria-current={
                selectedMessageId === message.id ? 'true' : undefined
              }
              className={cn(
                'block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60',
                selectedMessageId === message.id && 'bg-primary/5',
                !message.read && 'bg-muted/30',
              )}
              key={message.id}
              onClick={() => onSelect(message)}
              type='button'
            >
              <div className='flex items-center gap-2'>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    !message.read && 'font-semibold',
                  )}
                >
                  {sender || labels.unknownSender}
                </span>
                {message.starred ? (
                  <Star
                    aria-label='Starred'
                    className='size-3.5 fill-amber-400 text-amber-500'
                  />
                ) : null}
                <time className='shrink-0 text-xs text-muted-foreground'>
                  {formatMessageDate(message.receivedAt ?? message.sentAt)}
                </time>
              </div>
              <div className='mt-1 flex items-center gap-2'>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    !message.read && 'font-medium',
                  )}
                >
                  {message.subject || labels.noSubject}
                </span>
                {message.hasAttachments ? (
                  <Paperclip
                    aria-label='Has attachments'
                    className='size-3.5 text-muted-foreground'
                  />
                ) : null}
              </div>
              {message.preview ? (
                <p className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>
                  {message.preview}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
      {nextCursor ? (
        <div className='p-3'>
          <Button
            className='w-full'
            disabled={loading}
            onClick={onLoadMore}
            variant='outline'
          >
            {labels.loadMore}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function formatMessageDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}
