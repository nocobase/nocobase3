import { useState } from 'react';
import { Loader2, Mail, MessageSquareText, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { sendTestEmail, sendTestInApp } from './api.js';

export interface SendNotificationTestDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSent: () => void;
}

export function SendNotificationTestDialog({
  open,
  onOpenChange,
  onSent,
}: SendNotificationTestDialogProps): React.ReactElement {
  const [channel, setChannel] = useState<'email' | 'in-app'>('email');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('NocoBase notification test');
  const [body, setBody] = useState(
    'This message confirms that notification delivery is working.',
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    const recipients = recipient
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (recipients.length === 0 || body.trim().length === 0) {
      setError('Add at least one recipient and a message.');
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      if (channel === 'email') {
        if (!subject.trim()) throw new Error('Email subject is required.');
        await sendTestEmail({ addresses: recipients, subject, text: body });
      } else {
        await sendTestInApp({
          userIds: recipients,
          title: subject.trim() || undefined,
          body,
        });
      }
      onOpenChange(false);
      onSent();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Test send failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Send a test notification</DialogTitle>
          <DialogDescription>
            Exercise the real channel and provider pipeline, then inspect the
            new delivery in the log.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={channel}
          onValueChange={(value) => setChannel(value as 'email' | 'in-app')}
        >
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='email'>
              <Mail /> Email
            </TabsTrigger>
            <TabsTrigger value='in-app'>
              <MessageSquareText /> In-app
            </TabsTrigger>
          </TabsList>
          <TabsContent value='email' className='mt-4 space-y-4'>
            <Field label='Email addresses'>
              <Textarea
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder='alice@example.com, bob@example.com'
                rows={2}
              />
            </Field>
          </TabsContent>
          <TabsContent value='in-app' className='mt-4 space-y-4'>
            <Field label='User IDs'>
              <Textarea
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder='user-1, user-2'
                rows={2}
              />
            </Field>
          </TabsContent>
        </Tabs>
        <Field label={channel === 'email' ? 'Subject' : 'Title'}>
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <Field label='Message'>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
          />
        </Field>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={sending} onClick={() => void submit()}>
            {sending ? <Loader2 className='animate-spin' /> : <Send />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: React.PropsWithChildren<{ readonly label: string }>): React.ReactElement {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
