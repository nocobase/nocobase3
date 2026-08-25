import { defineSeed, type SeedDefinition } from '@nocobase/app-database';
import { hashPassword } from 'better-auth/crypto';

import { createSeedState } from '../store.js';

const seed: SeedDefinition = defineSeed({
  name: '202608240001_service_desk_demo',

  async run({ query }): Promise<void> {
    const now = new Date();
    const existingUser = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'nocobase')
      .executeTakeFirst();
    if (!existingUser) {
      const userId = crypto.randomUUID();
      await query
        .insertInto('user')
        .values({
          id: userId,
          name: 'nocobase',
          username: 'nocobase',
          email: 'nocobase@example.com',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: crypto.randomUUID(),
          issuer: 'local:credential',
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword('admin123'),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const existingTicket = await query
      .selectFrom('app_service_desk_tickets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existingTicket) return;

    const state = createSeedState();
    await query
      .insertInto('app_service_desk_meta')
      .values([
        { key: 'nextTicketSequence', value: state.nextTicketSequence },
        { key: 'nextCustomerSequence', value: state.nextCustomerSequence },
        { key: 'nextActivitySequence', value: state.nextActivitySequence },
      ])
      .execute();
    await query
      .insertInto('app_service_desk_customers')
      .values(
        state.customers.map((customer) => ({
          ...customer,
          createdAt: new Date(customer.createdAt),
        })),
      )
      .execute();
    await query
      .insertInto('app_service_desk_services')
      .values(
        state.services.map((service) => ({
          id: service.id,
          name: service.name,
          category: service.category,
          ownerTeam: service.ownerTeam,
          slaMinutes: service.slaMinutes,
          status: service.status,
        })),
      )
      .execute();
    await query
      .insertInto('app_service_desk_agents')
      .values(
        state.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          team: agent.team,
          role: agent.role,
          status: agent.status,
        })),
      )
      .execute();
    await query
      .insertInto('app_service_desk_tickets')
      .values(
        state.tickets.map((ticket) => {
          const { activities: _activities, ...record } = ticket;
          return {
            ...record,
            slaDueAt: new Date(ticket.slaDueAt),
            resolvedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt) : null,
            createdAt: new Date(ticket.createdAt),
            updatedAt: new Date(ticket.updatedAt),
          };
        }),
      )
      .execute();
    const activities = state.tickets.flatMap((ticket) =>
      ticket.activities.map((activity) => ({
        ...activity,
        ticketId: ticket.id,
        createdAt: new Date(activity.createdAt),
      })),
    );
    if (activities.length) {
      await query
        .insertInto('app_service_desk_activities')
        .values(activities)
        .execute();
    }
  },
});

export default seed;
