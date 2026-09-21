import { useTranslation } from '@nocobase/i18n/client';
import {
  CreditCardIcon,
  DownloadIcon,
  FileTextIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SettingsIcon,
  UploadIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';

import { ExamplePage, ExampleSection } from '../shared';

const TEAM_MEMBERS: readonly string[] = [
  'Ava Chen',
  'Liam Patel',
  'Noah Fischer',
  'Mia Rossi',
  'Ethan Novak',
];

export default function CommandExamplePage(): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<string>(TEAM_MEMBERS[0] ?? '');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const runCommand = (label: string): void => {
    setLastCommand(label);
    setOpen(false);
  };

  return (
    <ExamplePage
      title={t('devComponents.command.title')}
      description={t('devComponents.command.description')}
      source='client/pages/dev/components/command.tsx'
      docs='https://ui.shadcn.com/docs/components/command'
    >
      <ExampleSection
        title={t('devComponents.command.basic')}
        description={t('devComponents.command.basicDescription')}
        contentClassName='block'
      >
        <Command className='w-full max-w-sm rounded-lg border'>
          <CommandInput placeholder={t('devComponents.command.placeholder')} />
          <CommandList>
            <CommandEmpty>{t('devComponents.command.empty')}</CommandEmpty>
            <CommandGroup heading={t('devComponents.command.navigation')}>
              <CommandItem>
                <PackageIcon />
                <span>{t('devComponents.command.orders')}</span>
              </CommandItem>
              <CommandItem>
                <UsersIcon />
                <span>{t('devComponents.command.customers')}</span>
              </CommandItem>
              <CommandItem>
                <ReceiptIcon />
                <span>{t('devComponents.command.invoices')}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t('devCommon.actions')}>
              <CommandItem>
                <PlusIcon />
                <span>{t('devComponents.command.newOrder')}</span>
              </CommandItem>
              <CommandItem>
                <UploadIcon />
                <span>{t('devComponents.command.importCsv')}</span>
              </CommandItem>
              <CommandItem>
                <DownloadIcon />
                <span>{t('devComponents.command.exportReport')}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.command.dialog')}
        description={t('devComponents.command.dialogDescription')}
      >
        <Button variant='outline' onClick={() => setOpen(true)}>
          {t('devComponents.command.openPalette')}
          <KbdGroup data-icon='inline-end'>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        <span className='text-sm text-muted-foreground'>
          {lastCommand
            ? t('devComponents.command.lastRun', { command: lastCommand })
            : t('devComponents.command.nothingRun')}
        </span>
        <CommandDialog
          open={open}
          onOpenChange={setOpen}
          title={t('devComponents.command.paletteTitle')}
          description={t('devComponents.command.paletteDescription')}
        >
          <Command>
            <CommandInput
              placeholder={t('devComponents.command.placeholder')}
            />
            <CommandList>
              <CommandEmpty>{t('devComponents.command.empty')}</CommandEmpty>
              <CommandGroup heading={t('devComponents.command.navigation')}>
                <CommandItem
                  onSelect={() => runCommand(t('devComponents.command.orders'))}
                >
                  <PackageIcon />
                  <span>{t('devComponents.command.orders')}</span>
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.customers'))
                  }
                >
                  <UsersIcon />
                  <span>{t('devComponents.command.customers')}</span>
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.invoices'))
                  }
                >
                  <ReceiptIcon />
                  <span>{t('devComponents.command.invoices')}</span>
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.products'))
                  }
                >
                  <FileTextIcon />
                  <span>{t('devComponents.command.products')}</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t('devCommon.actions')}>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.newOrder'))
                  }
                >
                  <PlusIcon />
                  <span>{t('devComponents.command.newOrder')}</span>
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.newCustomer'))
                  }
                >
                  <UserRoundIcon />
                  <span>{t('devComponents.command.newCustomer')}</span>
                  <CommandShortcut>⇧⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.exportReport'))
                  }
                >
                  <DownloadIcon />
                  <span>{t('devComponents.command.exportReport')}</span>
                  <CommandShortcut>⌘E</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t('devCommon.settings')}>
                <CommandItem
                  onSelect={() => runCommand(t('devCommon.profile'))}
                >
                  <UserRoundIcon />
                  <span>{t('devCommon.profile')}</span>
                  <CommandShortcut>⌘P</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() =>
                    runCommand(t('devComponents.command.billing'))
                  }
                >
                  <CreditCardIcon />
                  <span>{t('devComponents.command.billing')}</span>
                  <CommandShortcut>⌘B</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => runCommand(t('devCommon.settings'))}
                >
                  <SettingsIcon />
                  <span>{t('devCommon.settings')}</span>
                  <CommandShortcut>⌘S</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.command.shortcuts')}
        description={t('devComponents.command.shortcutsDescription')}
        contentClassName='block'
      >
        <Command className='w-full max-w-sm rounded-lg border'>
          <CommandInput placeholder={t('devComponents.command.placeholder')} />
          <CommandList>
            <CommandEmpty>{t('devComponents.command.empty')}</CommandEmpty>
            <CommandGroup heading={t('devCommon.actions')}>
              <CommandItem>
                <PlusIcon />
                <span>{t('devComponents.command.newOrder')}</span>
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <DownloadIcon />
                <span>{t('devComponents.command.exportReport')}</span>
                <CommandShortcut>⌘E</CommandShortcut>
              </CommandItem>
              <CommandItem disabled>
                <UploadIcon />
                <span>{t('devComponents.command.importCsv')}</span>
                <CommandShortcut>⌘I</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t('devCommon.settings')}>
              <CommandItem>
                <UserRoundIcon />
                <span>{t('devCommon.profile')}</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <SettingsIcon />
                <span>{t('devCommon.settings')}</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.command.selection')}
        description={t('devComponents.command.selectionDescription')}
        contentClassName='block'
      >
        <div className='flex w-full max-w-sm flex-col gap-3'>
          <div className='flex items-center gap-2 text-sm'>
            <span className='text-muted-foreground'>
              {t('devComponents.command.assignedTo')}
            </span>
            <Badge variant='secondary'>{assignee}</Badge>
          </div>
          <Command className='rounded-lg border'>
            <CommandInput
              placeholder={t('devComponents.command.searchMembers')}
            />
            <CommandList>
              <CommandEmpty>{t('devComponents.command.empty')}</CommandEmpty>
              <CommandGroup heading={t('devComponents.command.team')}>
                {TEAM_MEMBERS.map((member) => (
                  <CommandItem
                    key={member}
                    data-checked={member === assignee}
                    onSelect={() => setAssignee(member)}
                  >
                    <UserRoundIcon />
                    <span>{member}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </ExampleSection>
    </ExamplePage>
  );
}
