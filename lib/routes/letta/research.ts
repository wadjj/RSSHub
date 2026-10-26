import type { Route } from '@/types';

import { getFeed } from './utils';

export const route: Route = {
    path: '/research',
    categories: ['blog'],
    example: '/letta/research',
    name: 'Research',
    maintainers: ['wadjj'],
    url: 'www.letta.com/research/',
    radar: [{ source: ['www.letta.com/research/'], target: '/research' }],
    features: { requireConfig: false, requirePuppeteer: false, antiCrawler: false, supportRadar: true },
    description:
        'Full research articles, including FrontierMemory and the HTML version of the MemGPT paper. Publication dates come from article metadata; arXiv uses the first submission date. When a source only publishes a month (currently FrontierMemory), RSS represents it as the first day of that month, not an exact publication day. Dates without a time use midnight UTC.',
    handler: () => getFeed('research'),
};
