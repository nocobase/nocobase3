import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Demonstration data is part of this Examples application. Stable identities and
// insert-only retries preserve records edited through the Repository API.
const seed: SeedDefinition = defineSeed({
  name: '202609090001_seed_analytics',
  transaction: true,
  async run({ query }) {
    const groups: {
      collection: string;
      records: Record<string, string | number>[];
    }[] = [
      {
        collection: 'channels',
        records: [
          { id: 'channel-search', name: '搜索广告', code: 'search' },
          { id: 'channel-social', name: '社交媒体', code: 'social' },
          { id: 'channel-email', name: '邮件推广', code: 'email' },
        ],
      },
      {
        collection: 'campaigns',
        records: [
          {
            id: 'campaign-search',
            name: '秋季关键词推广',
            channelId: 'channel-search',
            status: 'active',
            budgetCents: 300000,
          },
          {
            id: 'campaign-social',
            name: '新品社交推广',
            channelId: 'channel-social',
            status: 'active',
            budgetCents: 200000,
          },
          {
            id: 'campaign-email',
            name: '老客户回访',
            channelId: 'channel-email',
            status: 'completed',
            budgetCents: 50000,
          },
          {
            id: 'campaign-draft',
            name: '品牌词测试',
            channelId: 'channel-search',
            status: 'draft',
            budgetCents: 100000,
          },
        ],
      },
      { collection: 'dailyMetrics', records: [] },
    ];
    const metrics = groups[2].records;
    for (const [index, date] of [
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ].entries()) {
      for (const [
        campaignId,
        impressions,
        clicks,
        conversions,
        spendCents,
        revenueCents,
      ] of [
        ['campaign-search', 12000, 480, 24, 18000, 96000],
        ['campaign-social', 18000, 360, 12, 12000, 48000],
        ['campaign-email', 2000, 200, 20, 1000, 80000],
        ['campaign-draft', 0, 0, 0, 0, 0],
      ] as const) {
        const factor = index + 1;
        metrics.push({
          id: `${campaignId}-${date}`,
          campaignId,
          date,
          impressions: impressions * factor,
          clicks: clicks * factor,
          conversions: conversions * factor,
          spendCents: spendCents * factor,
          revenueCents: revenueCents * factor,
        });
      }
    }
    for (const { collection, records } of groups) {
      for (const record of records) {
        if (
          await query
            .selectFrom(collection)
            .select('id')
            .where('id', '=', record.id)
            .executeTakeFirst()
        )
          continue;
        await query.insertInto(collection).values(record).execute();
      }
    }
  },
});

export default seed;
