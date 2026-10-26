import type { Route } from '@/types';

import { getBlog } from './blog';

export const route: Route = {
    path: '/research/:locale?',
    name: 'Research',
    categories: ['programming'],
    example: '/cursor/research/cn',
    parameters: { locale: 'Locale, for example cn or ja; omit for English.' },
    maintainers: ['wadjj'],
    url: 'cursor.com/blog/topic/research',
    description: 'Research articles with full content, including linked x.ai announcements.',
    handler: (ctx) => getBlog('research', ctx.req.param('locale'), Number(ctx.req.query('limit')) || 10),
};
