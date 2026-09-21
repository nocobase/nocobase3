import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, UserIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

import { ExamplePage, ExampleSection } from '../shared';

type MemberRole = 'owner' | 'editor' | 'viewer';

interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  readonly role: MemberRole;
}

const members: readonly Member[] = [
  {
    id: 'olivia',
    name: 'Olivia Martin',
    email: 'olivia.martin@acme.com',
    initials: 'OM',
    role: 'owner',
  },
  {
    id: 'jackson',
    name: 'Jackson Lee',
    email: 'jackson.lee@acme.com',
    initials: 'JL',
    role: 'editor',
  },
  {
    id: 'isabella',
    name: 'Isabella Nguyen',
    email: 'isabella.nguyen@acme.com',
    initials: 'IN',
    role: 'editor',
  },
  {
    id: 'william',
    name: 'William Kim',
    email: 'william.kim@acme.com',
    initials: 'WK',
    role: 'viewer',
  },
];

const roleLabelKey: Record<MemberRole, string> = {
  owner: 'devCommon.owner',
  editor: 'devComponents.avatar.roleEditor',
  viewer: 'devComponents.avatar.roleViewer',
};

const avatarUrl = (id: string): string => `https://avatar.vercel.sh/${id}`;

export default function AvatarExamplePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <ExamplePage
      title={t('devComponents.avatar.title')}
      description={t('devComponents.avatar.description')}
      source='client/pages/dev/components/avatar.tsx'
      docs='https://ui.shadcn.com/docs/components/avatar'
    >
      <ExampleSection
        title={t('devComponents.avatar.basic')}
        description={t('devComponents.avatar.basicDescription')}
      >
        <Avatar>
          <AvatarImage src={avatarUrl('olivia')} alt='Olivia Martin' />
          <AvatarFallback>OM</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>JL</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>
            <UserIcon className='size-4' aria-hidden='true' />
            <span className='sr-only'>
              {t('devComponents.avatar.unknownUser')}
            </span>
          </AvatarFallback>
        </Avatar>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.avatar.sizes')}
        description={t('devComponents.avatar.sizesDescription')}
      >
        <Avatar size='sm'>
          <AvatarImage src={avatarUrl('olivia')} alt='Olivia Martin' />
          <AvatarFallback>OM</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarImage src={avatarUrl('olivia')} alt='Olivia Martin' />
          <AvatarFallback>OM</AvatarFallback>
        </Avatar>
        <Avatar size='lg'>
          <AvatarImage src={avatarUrl('olivia')} alt='Olivia Martin' />
          <AvatarFallback>OM</AvatarFallback>
        </Avatar>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.avatar.badge')}
        description={t('devComponents.avatar.badgeDescription')}
      >
        <Avatar>
          <AvatarImage src={avatarUrl('jackson')} alt='Jackson Lee' />
          <AvatarFallback>JL</AvatarFallback>
          <AvatarBadge>
            <span className='sr-only'>{t('devComponents.avatar.online')}</span>
          </AvatarBadge>
        </Avatar>
        <Avatar>
          <AvatarImage src={avatarUrl('isabella')} alt='Isabella Nguyen' />
          <AvatarFallback>IN</AvatarFallback>
          <AvatarBadge className='bg-muted-foreground'>
            <span className='sr-only'>{t('devComponents.avatar.away')}</span>
          </AvatarBadge>
        </Avatar>
        <Avatar>
          <AvatarImage src={avatarUrl('william')} alt='William Kim' />
          <AvatarFallback>WK</AvatarFallback>
          <AvatarBadge className='bg-destructive'>
            <span className='sr-only'>{t('devComponents.avatar.busy')}</span>
          </AvatarBadge>
        </Avatar>
        <Avatar size='lg'>
          <AvatarImage src={avatarUrl('olivia')} alt='Olivia Martin' />
          <AvatarFallback>OM</AvatarFallback>
          <AvatarBadge>
            <PlusIcon aria-hidden='true' />
            <span className='sr-only'>{t('devCommon.add')}</span>
          </AvatarBadge>
        </Avatar>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.avatar.group')}
        description={t('devComponents.avatar.groupDescription')}
        contentClassName='flex-col items-start gap-6'
      >
        <AvatarGroup>
          {members.slice(0, 3).map((member) => (
            <Avatar key={member.id}>
              <AvatarImage src={avatarUrl(member.id)} alt={member.name} />
              <AvatarFallback>{member.initials}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
        <AvatarGroup>
          {members.slice(0, 3).map((member) => (
            <Avatar key={member.id} size='sm'>
              <AvatarImage src={avatarUrl(member.id)} alt={member.name} />
              <AvatarFallback>{member.initials}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
        <AvatarGroup>
          {members.slice(0, 3).map((member) => (
            <Avatar key={member.id} size='lg'>
              <AvatarImage src={avatarUrl(member.id)} alt={member.name} />
              <AvatarFallback>{member.initials}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>
            <PlusIcon aria-hidden='true' />
            <span className='sr-only'>{t('devCommon.add')}</span>
          </AvatarGroupCount>
        </AvatarGroup>
      </ExampleSection>

      <ExampleSection
        title={t('devComponents.avatar.inList')}
        description={t('devComponents.avatar.inListDescription')}
        contentClassName='block'
      >
        <ul className='w-full max-w-md divide-y rounded-lg border'>
          {members.map((member) => (
            <li
              key={member.id}
              className='flex items-center gap-3 px-4 py-3 text-sm'
            >
              <Avatar>
                <AvatarImage src={avatarUrl(member.id)} alt={member.name} />
                <AvatarFallback>{member.initials}</AvatarFallback>
              </Avatar>
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>{member.name}</p>
                <p className='truncate text-muted-foreground'>{member.email}</p>
              </div>
              <Badge variant={member.role === 'owner' ? 'default' : 'outline'}>
                {t(roleLabelKey[member.role])}
              </Badge>
            </li>
          ))}
        </ul>
      </ExampleSection>
    </ExamplePage>
  );
}
