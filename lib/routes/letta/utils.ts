import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';
import pMap from 'p-map';

import type { Data, DataItem } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://www.letta.com';
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// RSS needs a timestamp. Month-only source dates retain month precision by using day 1.
export function publicationDate(value: string): Date | undefined {
    const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:T.*)?$/.exec(value.trim());
    const named = /\b([a-z]{3,9})\s+(?:(\d{1,2}),?\s+)?(\d{4})\s*$/i.exec(value.trim());
    let dateOnly: string | undefined;
    if (iso) {
        dateOnly = `${iso[1]}-${iso[2]}-${iso[3]}`;
    } else if (named) {
        const month = months.indexOf(named[1].slice(0, 3).toLowerCase()) + 1;
        if (month) {
            dateOnly = `${named[3]}-${String(month).padStart(2, '0')}-${(named[2] || '1').padStart(2, '0')}`;
        }
    }
    if (!dateOnly) {
        return;
    }
    const date = parseDate(`${dateOnly}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().startsWith(dateOnly)) {
        return date;
    }
}

function contentHtml($: CheerioAPI, selector: string, url: string): string {
    const content = $(selector).first().clone();
    content.find('script, style, nav, header, footer, form, button, .subscribe, [aria-label="subscribe"], .citation, .cite, [aria-label="Cite this post"], .ltx_authors, h1').remove();
    content.find('[href], [src], [poster]').each((_, element) => {
        const node = $(element);
        for (const attribute of ['href', 'src', 'poster']) {
            const value = node.attr(attribute);
            if (value) {
                node.attr(attribute, new URL(value, url).href);
            }
        }
        node.removeAttr('srcset');
    });
    const html = content.html();
    if (!html || !content.text().trim()) {
        throw new Error(`Letta article content is missing at ${url}`);
    }
    return html;
}

function fetchHtml(url: string): Promise<string> {
    return ofetch<string>(url, { responseType: 'text', timeout: 15000, retry: 1 });
}

function getArticle(item: DataItem, listingDate: string): Promise<DataItem> {
    const link = item.link!;
    return cache.tryGet(`letta:fulltext:v1:${link}`, async () => {
        const response = await fetchHtml(link);
        const $ = load(response);
        const rawDate = $('meta[property="article:published_time"]').attr('content') || $('meta[name="citation_date"]').attr('content') || $('.post-head .date').text() || $('.post-byline').text() || listingDate;
        const pubDate = publicationDate(rawDate);
        if (!pubDate) {
            throw new Error(`Letta publication date is missing or invalid at ${link}`);
        }

        let description: string;
        let attachment: Partial<DataItem> = {};
        if (new URL(link).hostname === 'arxiv.org') {
            const paperPath = $('#latexml-download-link').attr('href');
            if (!paperPath) {
                throw new Error(`arXiv HTML paper link is missing at ${link}`);
            }
            const paperUrl = new URL(paperPath, link).href;
            const paperResponse = await fetchHtml(paperUrl);
            const paper = load(paperResponse);
            description = contentHtml(paper, 'article.ltx_document', paperUrl);
            const pdf = $('meta[name="citation_pdf_url"]').attr('content');
            if (pdf) {
                attachment = { enclosure_url: new URL(pdf, link).href, enclosure_type: 'application/pdf' };
            }
        } else {
            description = contentHtml($, 'article.post', link);
        }

        const image = $('meta[property="og:image"]').attr('content');
        return {
            ...item,
            ...attachment,
            pubDate,
            description,
            author: $('meta[name="author"]').attr('content') || 'Letta',
            ...(image ? { image: new URL(image, link).href } : {}),
        };
    });
}

export async function getFeed(section: 'blog' | 'research'): Promise<Data> {
    const link = `${baseUrl}/${section}/`;
    const response = await fetchHtml(link);
    const $ = load(response);
    const seen = new Set<string>();
    const entries = $('a.pub[href]')
        .toArray()
        .map((element) => {
            const node = $(element);
            return {
                item: { title: node.find('.pub__title').text(), link: new URL(node.attr('href')!, link).href },
                listingDate: node.find('.pub__date').text(),
            };
        })
        .filter(({ item }) => {
            if (!item.title || seen.has(item.link)) {
                return false;
            }
            seen.add(item.link);
            return true;
        });

    return {
        title: section === 'blog' ? 'Letta Blog' : 'Letta Research',
        link,
        description: 'Full articles with original publication dates. Month-only dates are represented by the first day of the month.',
        language: 'en',
        item: await pMap(entries, ({ item, listingDate }) => getArticle(item, listingDate), { concurrency: 5 }),
    };
}
