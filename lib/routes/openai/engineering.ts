import type { Route } from '@/types';

import { fetchArticles } from './common';

export const route: Route = {
    path: '/engineering',
    name: 'Engineering',
    categories: ['programming'],
    example: '/openai/engineering',
    maintainers: ['wadjj'],
    url: 'openai.com/news/engineering',
    description: 'Full articles from the official Engineering RSS feed, preserving its publication dates and selection.',
    handler: async (ctx) => ({
        title: 'OpenAI Engineering',
        link: 'https://openai.com/news/engineering/',
        item: await fetchArticles(Number(ctx.req.query('limit')) || 10, undefined, 'https://openai.com/news/engineering/rss.xml'),
    }),
};
