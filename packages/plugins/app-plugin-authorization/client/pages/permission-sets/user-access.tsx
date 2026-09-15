import { Fragment, useMemo, useState, type ReactElement } from 'react';

import type {
  AuthorizationOptions,
  AuthorizationUser,
  DefaultAccessRule,
  PermissionSet,
  PermissionSetAssignment,
  RestrictionRule,
  SharingRule,
} from '../../authorization-client.js';
import { NoticeBox } from '../../components/feedback.js';
import { SearchCombobox } from '../../components/filters.js';
import {
  DetailHeader,
  EmptyTableRow,
  ManagementTable,
} from '../../components/management-ui.js';
import { Badge } from '../../components/ui/badge.js';
import { Card } from '../../components/ui/card.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '../../components/ui/empty.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import type { UserDirectory } from '../../components/user-directory.js';
import {
  collectionsInPlay,
  heldViaLabels,
  holdsUnrestricted,
  relevantDefaultAccess,
  relevantRestrictionRules,
  relevantSharingRules,
  setTitle,
  setsHeldBy,
  userGrants,
  type RelevantRule,
} from './access-report.js';
import { humanize } from './labels.js';

/**
 * The rule settings this screen could read. A missing one was refused: the
 * three rule lists authorize separately from the permission sets, so the
 * section is left out rather than failing the screen.
 */
export interface AccessRuleSources {
  readonly defaultAccess?: readonly DefaultAccessRule[];
  readonly sharing?: readonly SharingRule[];
  readonly restriction?: readonly RestrictionRule[];
}

const MATCH_LIMIT = 8;

/** What one person has been granted, and which set granted it. */
export function UserAccess({
  options,
  sets,
  directory,
  assignments,
  rules,
  onBack,
}: {
  options: AuthorizationOptions;
  sets: readonly PermissionSet[];
  directory: UserDirectory;
  assignments: readonly PermissionSetAssignment[];
  rules: AccessRuleSources;
  onBack: () => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuthorizationUser>();

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return directory.users
      .filter((user) =>
        [user.name, user.email, user.username].some((value) =>
          value?.toLowerCase().includes(query),
        ),
      )
      .slice(0, MATCH_LIMIT);
  }, [directory, search]);

  return (
    <div className='space-y-5'>
      <DetailHeader
        onBack={onBack}
        title='User access'
        subtitle='What one person has been granted, and which set granted it.'
      />
      {directory.unavailable === undefined ? null : (
        <NoticeBox>{directory.unavailable}</NoticeBox>
      )}
      <SearchCombobox
        disabled={directory.unavailable !== undefined}
        emptyMessage={`Nobody matches “${search.trim()}”.`}
        items={matches}
        itemKey={(user) => user.id}
        label='Search people'
        placeholder='Search by name or email'
        renderItem={(user) => (
          <span className='flex min-w-0 flex-col'>
            <span className='font-medium'>{user.name}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {user.username ?? user.email}
            </span>
          </span>
        )}
        value={search}
        onChange={setSearch}
        onSelect={(user) => {
          setSelected(user);
          setSearch(user.name);
        }}
      />
      {selected ? (
        <PersonAccess
          assignments={assignments}
          options={options}
          rules={rules}
          sets={sets}
          user={selected}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No one chosen yet</EmptyTitle>
            <EmptyDescription>
              Search for a person by name or address to see the sets they hold
              and what those sets grant.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function PersonAccess({
  options,
  sets,
  assignments,
  rules,
  user,
}: {
  options: AuthorizationOptions;
  sets: readonly PermissionSet[];
  assignments: readonly PermissionSetAssignment[];
  rules: AccessRuleSources;
  user: AuthorizationUser;
}): ReactElement {
  const held = setsHeldBy(user.id, sets, assignments);
  const unrestricted = holdsUnrestricted(held);
  const grants = unrestricted ? [] : userGrants(options, held);
  const collections = collectionsInPlay(held);
  const widening = unrestricted
    ? []
    : [
        ...(rules.defaultAccess
          ? relevantDefaultAccess(rules.defaultAccess, collections)
          : []),
        ...(rules.sharing ? relevantSharingRules(rules.sharing, user.id) : []),
      ];
  const narrowing = rules.restriction
    ? relevantRestrictionRules(rules.restriction, user.id)
    : [];
  // Restrictions apply to an unrestricted holder too, so that section is never dropped for them.
  const rulesReadable =
    rules.defaultAccess !== undefined ||
    rules.sharing !== undefined ||
    rules.restriction !== undefined;

  return (
    <>
      <Card className='p-5'>
        <p className='font-medium'>{user.name}</p>
        <p className='text-sm text-muted-foreground'>
          {user.username ?? user.email}
        </p>
        <div className='mt-4 flex flex-wrap gap-2'>
          {held.length === 0 ? (
            <span className='text-sm text-muted-foreground'>
              Holds no permission sets.
            </span>
          ) : (
            held.map((item) => (
              <Badge
                key={item.set.key}
                className='bg-muted text-muted-foreground'
              >
                {setTitle(item.set)} · {heldViaLabels[item.via]}
              </Badge>
            ))
          )}
        </div>
      </Card>
      {unrestricted ? (
        <NoticeBox title={`${user.name} has unrestricted access.`}>
          <p>
            Holding an unrestricted set bypasses every grant, so grants are not
            consulted and there is no permission list to show. Restriction rules
            still apply.
          </p>
        </NoticeBox>
      ) : held.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No permission sets</EmptyTitle>
            <EmptyDescription>
              This person holds no set, so nothing grants them an action. Assign
              a set from its assignments tab.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ManagementTable>
          <Table className='min-w-[42rem]'>
            <TableHeader className='bg-muted/30 uppercase'>
              <TableRow>
                <TableHead className='px-5 py-3 font-medium'>Action</TableHead>
                <TableHead className='px-5 py-3 font-medium'>
                  Starts from
                </TableHead>
                <TableHead className='px-5 py-3 font-medium'>Fields</TableHead>
                <TableHead className='px-5 py-3 font-medium'>
                  Granted by
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((grant) => (
                <Fragment key={grant.key}>
                  <TableRow className='hover:bg-transparent'>
                    <TableCell
                      className='bg-muted/20 px-5 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'
                      colSpan={4}
                    >
                      {grant.groupLabel} · {grant.label}
                    </TableCell>
                  </TableRow>
                  {grant.actions.map((action) => (
                    <TableRow
                      key={`${grant.key}:${action.action}:${action.grantedBy}`}
                    >
                      <TableCell className='px-5 py-3 font-medium'>
                        {humanize(action.action)}
                      </TableCell>
                      <TableCell className='px-5 py-3'>
                        {action.records}
                      </TableCell>
                      <TableCell className='px-5 py-3 text-sm text-muted-foreground'>
                        {action.fields}
                      </TableCell>
                      <TableCell className='px-5 py-3'>
                        {action.grantedBy}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {grants.length === 0 ? (
                <EmptyTableRow colSpan={4}>
                  The sets this person holds grant no resources yet.
                </EmptyTableRow>
              ) : null}
            </TableBody>
          </Table>
        </ManagementTable>
      )}
      {rulesReadable ? (
        <RuleSections
          narrowing={narrowing}
          unrestricted={unrestricted}
          widening={widening}
        />
      ) : null}
    </>
  );
}

function RuleSections({
  widening,
  narrowing,
  unrestricted,
}: {
  widening: readonly RelevantRule[];
  narrowing: readonly RelevantRule[];
  unrestricted: boolean;
}): ReactElement {
  return (
    <Card className='space-y-4 p-5'>
      <div>
        <h3 className='font-medium'>Rules that may adjust this</h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          Rules resolve per request, so this is what may apply rather than a
          computed result.
        </p>
      </div>
      {unrestricted ? null : (
        <RuleList
          empty='No default access or sharing rule widens what these grants reach.'
          rules={widening}
          title='Widens records'
          tone='bg-muted text-foreground'
        />
      )}
      <RuleList
        empty='No restriction rule removes records from this person.'
        rules={narrowing}
        title='Narrows records'
        tone='bg-destructive/10 text-destructive'
      />
    </Card>
  );
}

function RuleList({
  title,
  tone,
  rules,
  empty,
}: {
  title: string;
  tone: string;
  rules: readonly RelevantRule[];
  empty: string;
}): ReactElement {
  return (
    <section>
      <div className='flex items-center gap-2'>
        <Badge className={tone}>{title}</Badge>
      </div>
      {rules.length === 0 ? (
        <p className='mt-2 text-sm text-muted-foreground'>{empty}</p>
      ) : (
        <ul className='mt-2 divide-y rounded-lg border'>
          {rules.map((rule) => (
            <li
              key={`${title}:${rule.key}`}
              className='flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-sm'
            >
              <span className='font-medium'>{rule.title}</span>
              <span className='font-mono text-xs text-muted-foreground'>
                {rule.collection}
              </span>
              <span className='text-muted-foreground'>
                {rule.actions.map(humanize).join(', ')}
              </span>
              {rule.audience === undefined ? null : (
                <span className='text-xs text-muted-foreground'>
                  · {rule.audience}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
