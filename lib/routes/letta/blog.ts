import type { Route } from '@/types';

import { getFeed } from './utils';

export const route: Route = {
    path: '/blog',
    categories: ['blog'],
    example: '/letta/blog',
    name: 'Blog',
    maintainers: ['wadjj'],
    url: 'www.letta.com/blog/',
    radar: [{ source: ['www.letta.com/blog/'], target: '/blog' }],
    features: { requireConfig: false, requirePuppeteer: false, antiCrawler: false, supportRadar: true },
    description: 'Full article content and publication dates from article metadata, rather than the month-only listing or the crawl time. Date-only values use midnight UTC.',
    handler: () => getFeed('blog'),
};
