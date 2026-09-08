import { defineSeed, type SeedDefinition } from '@nocobase/db';

const seed: SeedDefinition = defineSeed({
  name: '202609080001_seed_articles',
  async run({ query }) {
    const articles = [
      {
        title: '欢迎来到文章中心',
        summary: '从一篇文章开始，整理想法、记录经验，让知识持续积累。',
        content:
          '欢迎使用文章中心。\n\n你可以在这里集中管理公告、操作指南和团队知识。每篇文章都包含标题、摘要、正文与发布状态。\n\n点击“新建文章”记录一个想法，或打开这篇文章体验预览与编辑。准备就绪后，将状态切换为“已发布”。',
        status: 'published',
        publishedAt: '2026-09-08T01:00:00.000Z',
      },
      {
        title: '写出清晰易读的文章',
        summary: '先给出结论，再补充背景和步骤，让读者快速找到需要的信息。',
        content:
          '一篇好文章从明确的问题开始。\n\n一、写一个具体的标题。让读者在打开之前就知道文章讨论什么。\n\n二、用摘要交代重点。摘要适合放结论、适用场景和阅读收益。\n\n三、把正文分成短段落。步骤清楚、例子具体，避免重复表达。\n\n四、发布前检查。确认事实、链接和文字没有遗漏。',
        status: 'published',
        publishedAt: '2026-09-08T02:00:00.000Z',
      },
      {
        title: '从草稿到发布：内容工作流',
        summary: '用草稿、已发布、已归档三个状态管理内容的生命周期。',
        content:
          '草稿用于保存正在整理的内容。你可以多次编辑，直到文章完整。\n\n已发布表示文章已经准备好供有访问权限的成员阅读。首次发布时会记录发布时间。\n\n已归档用于保留暂时不再使用的内容。需要重新使用时，可以编辑文章并调整状态。',
        status: 'published',
        publishedAt: '2026-09-08T03:00:00.000Z',
      },
      {
        title: '团队知识库建设计划',
        summary: '整理高频问题、产品说明与操作经验，逐步形成可复用的知识目录。',
        content:
          '本周准备整理以下内容：\n\n• 收集团队最近遇到的高频问题。\n• 为常见操作编写简明指南。\n• 检查已有文章是否需要更新。\n\n下一步：补充负责人和完成时间，再发布给团队。',
        status: 'draft',
        publishedAt: null,
      },
      {
        title: '文章发布前检查清单',
        summary: '确认标题、摘要、正文和状态，一次完成发布前的必要检查。',
        content:
          '发布前请逐项检查：\n\n• 标题是否准确表达主题？\n• 摘要是否覆盖主要内容？\n• 正文是否包含必要的背景与步骤？\n• 是否有过期信息或敏感内容？\n• 发布状态是否正确？\n\n完成检查后，即可保存并发布。',
        status: 'draft',
        publishedAt: null,
      },
      {
        title: '旧版内容整理说明',
        summary: '保留历史记录，避免旧版本内容与当前操作指南混淆。',
        content:
          '这是一篇归档文章，用于说明历史内容的管理方式。\n\n旧版本说明仍有参考价值，但不应作为当前操作依据。请根据最新发布的文章执行操作。',
        status: 'archived',
        publishedAt: '2026-09-01T01:00:00.000Z',
      },
    ];
    for (const article of articles) {
      if (
        await query
          .selectFrom('articles')
          .select('id')
          .where('title', '=', article.title)
          .executeTakeFirst()
      )
        continue;
      await query
        .insertInto('articles')
        .values({
          ...article,
          publishedAt: article.publishedAt
            ? new Date(article.publishedAt)
            : null,
          createdAt: new Date('2026-09-08T00:00:00.000Z'),
          updatedAt: new Date('2026-09-08T00:00:00.000Z'),
        })
        .execute();
    }
  },
});
export default seed;
