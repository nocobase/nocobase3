import { useTranslation } from '@nocobase/i18n/client';
import { CheckCheckIcon, RefreshCwIcon, ThumbsUpIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { ExamplePage, ExampleSection } from '../shared';

type QuickReply = 'invoice' | 'shipping' | 'agent';

const quickReplies: readonly QuickReply[] = ['invoice', 'shipping', 'agent'];

const quickReplyKey: Record<QuickReply, string> = {
  invoice: 'devComponents.bubble.replyInvoice',
  shipping: 'devComponents.bubble.replyShipping',
  agent: 'devComponents.bubble.replyAgent',
};

const quickReplyAnswerKey: Record<QuickReply, string> = {
  invoice: 'devComponents.bubble.answerInvoice',
  shipping: 'devComponents.bubble.answerShipping',
  agent: 'devComponents.bubble.answerAgent',
};

export default function BubbleExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [reply, setReply] = useState<QuickReply | undefined>();

  return (
    <TooltipProvider>
      <ExamplePage
        title={t('devComponents.bubble.title')}
        description={t('devComponents.bubble.description')}
        source='client/pages/dev/components/bubble.tsx'
        docs='https://ui.shadcn.com/docs/components/bubble'
      >
        <ExampleSection
          title={t('devComponents.bubble.conversation')}
          description={t('devComponents.bubble.conversationDescription')}
          contentClassName='block'
        >
          <div className='flex w-full max-w-sm flex-col gap-6'>
            <Bubble align='end'>
              <BubbleContent>
                {t('devComponents.bubble.customerAsks', { order: 'ORD-1042' })}
              </BubbleContent>
            </Bubble>
            <BubbleGroup>
              <Bubble variant='muted'>
                <BubbleContent>
                  {t('devComponents.bubble.agentChecking')}
                </BubbleContent>
              </Bubble>
              <Bubble variant='muted'>
                <BubbleContent>
                  {t('devComponents.bubble.agentShipped', {
                    tracking: '1Z 999 AA1 01 2345 6784',
                  })}
                </BubbleContent>
                <BubbleReactions
                  role='img'
                  aria-label={t('devComponents.bubble.reactionThumbsUp')}
                >
                  <span>👍</span>
                </BubbleReactions>
              </Bubble>
            </BubbleGroup>
            <Bubble align='end'>
              <BubbleContent>
                {t('devComponents.bubble.customerThanks')}
              </BubbleContent>
            </Bubble>
          </div>
        </ExampleSection>

        <ExampleSection
          title={t('devComponents.bubble.variants')}
          description={t('devComponents.bubble.variantsDescription')}
          contentClassName='block'
        >
          <div className='flex w-full max-w-sm flex-col gap-4'>
            <Bubble>
              <BubbleContent>
                {t('devComponents.bubble.variantDefault')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='secondary' align='end'>
              <BubbleContent>
                {t('devComponents.bubble.variantSecondary')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='muted'>
              <BubbleContent>
                {t('devComponents.bubble.variantMuted')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='tinted' align='end'>
              <BubbleContent>
                {t('devComponents.bubble.variantTinted')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='outline'>
              <BubbleContent>
                {t('devComponents.bubble.variantOutline')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='destructive' align='end'>
              <BubbleContent>
                {t('devComponents.bubble.variantDestructive')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='ghost'>
              <BubbleContent>
                {t('devComponents.bubble.variantGhost')}
              </BubbleContent>
            </Bubble>
          </div>
        </ExampleSection>

        <ExampleSection
          title={t('devComponents.bubble.reactions')}
          description={t('devComponents.bubble.reactionsDescription')}
          contentClassName='block'
        >
          <div className='flex w-full max-w-sm flex-col gap-10'>
            <Bubble variant='muted'>
              <BubbleContent>
                {t('devComponents.bubble.reactionsMessage')}
              </BubbleContent>
              <BubbleReactions
                role='img'
                aria-label={t('devComponents.bubble.reactionsSummary')}
              >
                <span>👍</span>
                <span>🎉</span>
                <span>👀</span>
                <span>+2</span>
              </BubbleReactions>
            </Bubble>
            <Bubble variant='muted'>
              <BubbleContent>
                {t('devComponents.bubble.reactionsTopMessage')}
              </BubbleContent>
              <BubbleReactions side='top' align='start'>
                <Button
                  variant='secondary'
                  size='icon-xs'
                  aria-label={t('devComponents.bubble.reactionThumbsUp')}
                >
                  <ThumbsUpIcon />
                </Button>
              </BubbleReactions>
            </Bubble>
            <Bubble align='end'>
              <BubbleContent>
                {t('devComponents.bubble.reactionsReadMessage')}
              </BubbleContent>
              <BubbleReactions>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant='ghost'
                        size='icon-xs'
                        aria-label={t('devComponents.bubble.readReceipt')}
                      />
                    }
                  >
                    <CheckCheckIcon />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('devComponents.bubble.readAt', {
                      time: 'Sep 12, 2026 · 16:32',
                    })}
                  </TooltipContent>
                </Tooltip>
              </BubbleReactions>
            </Bubble>
          </div>
        </ExampleSection>

        <ExampleSection
          title={t('devComponents.bubble.quickReplies')}
          description={t('devComponents.bubble.quickRepliesDescription')}
          contentClassName='block'
        >
          <div className='flex w-full max-w-sm flex-col gap-4'>
            <Bubble variant='muted'>
              <BubbleContent>
                {t('devComponents.bubble.howCanIHelp')}
              </BubbleContent>
            </Bubble>
            {reply ? (
              <>
                <Bubble variant='tinted' align='end'>
                  <BubbleContent>{t(quickReplyKey[reply])}</BubbleContent>
                </Bubble>
                <Bubble variant='muted'>
                  <BubbleContent>{t(quickReplyAnswerKey[reply])}</BubbleContent>
                </Bubble>
                <Button
                  variant='ghost'
                  size='sm'
                  className='self-start'
                  onClick={() => setReply(undefined)}
                >
                  {t('devCommon.reset')}
                </Button>
              </>
            ) : (
              <BubbleGroup>
                {quickReplies.map((option) => (
                  <Bubble key={option} variant='tinted' align='end'>
                    <BubbleContent
                      render={
                        <button
                          type='button'
                          onClick={() => setReply(option)}
                        />
                      }
                    >
                      {t(quickReplyKey[option])}
                    </BubbleContent>
                  </Bubble>
                ))}
              </BubbleGroup>
            )}
          </div>
        </ExampleSection>

        <ExampleSection
          title={t('devComponents.bubble.richContent')}
          description={t('devComponents.bubble.richContentDescription')}
          contentClassName='block'
        >
          <div className='flex w-full max-w-md flex-col gap-8'>
            <Bubble align='end'>
              <BubbleContent>
                {t('devComponents.bubble.richQuestion')}
              </BubbleContent>
            </Bubble>
            <Bubble variant='ghost'>
              <BubbleContent className='space-y-2'>
                <p>{t('devComponents.bubble.richIntro')}</p>
                <ul className='list-inside list-disc space-y-1'>
                  <li>
                    {t('devComponents.bubble.richStepOne')}{' '}
                    <code className='rounded bg-muted px-1 py-0.5 font-mono text-xs'>
                      pnpm migrate
                    </code>
                  </li>
                  <li>{t('devComponents.bubble.richStepTwo')}</li>
                  <li>{t('devComponents.bubble.richStepThree')}</li>
                </ul>
              </BubbleContent>
            </Bubble>
            <Bubble variant='destructive' align='end'>
              <BubbleContent>
                {t('devComponents.bubble.sendFailed')}
              </BubbleContent>
              <BubbleReactions align='start'>
                <Button
                  variant='secondary'
                  size='icon-xs'
                  aria-label={t('devComponents.bubble.retrySend')}
                >
                  <RefreshCwIcon />
                </Button>
              </BubbleReactions>
            </Bubble>
          </div>
        </ExampleSection>
      </ExamplePage>
    </TooltipProvider>
  );
}
