import { load } from 'cheerio';
import pMap from 'p-map';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/inside',
    name: 'Inside Lovable',
    categories: ['blog'],
    example: '/lovable/inside',
    maintainers: ['wadjj'],
    url: 'lovable.dev/blog',
    handler,
};

export async function handler(ctx) {
    const link = 'https://lovable.dev/blog?category=inside+lovable';
    const html = await ofetch(link);
    const $ = load(html);
    const limit = Number(ctx.req.query('limit')) || 20;
    const seen = new Set<string>();
    // The server-rendered page contains every category; the query only filters after hydration.
    const cards = $('main a[href^="/blog/"]')
        .toArray()
        .filter((el) =>
            $(el)
                .find('div')
                .toArray()
                .some((label) => $(label).text().trim() === 'Inside Lovable')
        )
        .map((el) => ({
            title: $(el).find('h2').text().trim(),
            link: new URL($(el).attr('href')!, link).href,
            pubDate: parseDate($(el).find('time').attr('datetime')!),
            category: ['Inside Lovable'],
        }))
        .filter((item) => {
            if (!item.title || seen.has(item.link)) {
                return false;
            }
            seen.add(item.link);
            return true;
        })
        .slice(0, limit);
    const item = await pMap(
        cards,
        (card) =>
            cache.tryGet(`lovable:inside:v1:${card.link}`, async () => {
                const articleHtml = await ofetch(card.link);
                const $article = load(articleHtml);
                const body = $article('article.prose').first();
                body.find('script, style, form, nav').remove();
                if (!body.text().trim()) {
                    throw new Error(`Missing article body for ${card.link}`);
                }
                return { ...card, description: body.html()! };
            }),
        { concurrency: 4 }
    );
    return { title: 'Lovable — Inside Lovable', link, item };
}
