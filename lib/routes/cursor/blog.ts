import { load } from 'cheerio';
import type { Context } from 'hono';
import pMap from 'p-map';

import type { Data, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const handler = async (ctx: Context): Promise<Data> => {
    const { topic, locale } = ctx.req.param();
    const limit = Number(ctx.req.query('limit') ?? '10');

    const baseUrl = 'https://cursor.com';
    const normalizedTopic = topic === 'all' ? undefined : topic;
    const localeSegment = locale ? `/${locale}` : '';
    const path = normalizedTopic ? `${localeSegment}/blog/topic/${normalizedTopic}` : `${localeSegment}/blog`;
    const targetUrl = new URL(path, baseUrl).href;

    const html = await ofetch(targetUrl);
    const $ = load(html);

    const main = $('#main').last(); // there are two main tags before hydration
    const seen = new Set<string>();
    const cards = main
        .find('article')
        .toArray()
        .map((el) => {
            const $el = $(el);
            const $link = $el.find('a').first().length ? $el.find('a').first() : $el.closest('a');

            const title = $el.find('p').first().text().trim();
            const description = $el.find('p').eq(1).text().trim();
            const $time = $el.find('time').first();
            const pubDate = parseDate($time.attr('datetime') || $time.text().trim());

            const href = $link.attr('href');
            const link = href ? new URL(href, baseUrl).href : undefined;

            return {
                title,
                description,
                pubDate,
                link,
            };
        })
        .filter((item) => {
            if (!item.title || !item.link || seen.has(item.link)) {
                return false;
            }
            seen.add(item.link);
            return true;
        })
        .slice(0, limit);

    const items = await pMap(
        cards,
        async (item) => {
            const hostname = new URL(item.link!).hostname;
            if (!['cursor.com', 'x.ai'].includes(hostname)) {
                return item;
            }
            const description = await cache.tryGet(`cursor:blog:body:v1:${item.link}`, async () => {
                const articleHtml = await ofetch(item.link!);
                const $article = load(articleHtml);
                const body = $article(hostname === 'x.ai' ? '.prose' : '.prose--blog, main article .prose').first();
                body.find('script, style').remove();
                return body.html() || item.description;
            });
            return { ...item, description };
        },
        { concurrency: 4 }
    );

    return {
        title: $('title').text() || 'Cursor Blog',
        description: $('meta[property="og:description"]').attr('content'),
        link: targetUrl,
        item: items,
        image: $('meta[property="og:image"]').attr('content'),
    };
};

export const route: Route = {
    path: '/blog/:topic?/:locale?',
    name: 'Blog',
    url: 'cursor.com',
    maintainers: ['johan456789'],
    example: '/cursor/blog',
    parameters: {
        locale: 'Locale appended to the route path, e.g. `ja`',
        topic: 'Topic: all | product | research | company | news',
    },
    description: undefined,
    categories: ['blog'],
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['cursor.com/blog'],
            target: '/blog',
        },
        {
            source: ['cursor.com/blog/topic/:topic'],
            target: '/blog/:topic',
        },
        {
            source: ['cursor.com/:locale/blog'],
            target: '/blog/all/:locale',
        },
        {
            source: ['cursor.com/:locale/blog/topic/:topic'],
            target: '/blog/:topic/:locale',
        },
    ],
    view: ViewType.Articles,
    handler,
};
