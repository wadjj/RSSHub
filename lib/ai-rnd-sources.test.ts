import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { handler as cursor } from './routes/cursor/blog';
import { handler as lovable } from './routes/lovable/inside';
import server from './setup.test';

function context(params: Record<string, string> = {}, limit = '10'): any {
    return { req: { param: (name?: string) => (name ? params[name] : params), query: () => limit } };
}

describe('AI RnD publication feeds', () => {
    it('filters Lovable server-rendered categories before applying the item limit', async () => {
        server.use(
            http.get('https://lovable.dev/blog', () =>
                HttpResponse.html(
                    '<main><a href="/blog/wrong"><div>Announcements</div><h2>Inside Lovable mentioned in title</h2></a><a href="/blog/test-inside"><div>Inside Lovable</div><h2>Engineering story</h2><time datetime="2026-10-15T00:00:00Z"></time></a><a href="/blog/test-inside"><div>Inside Lovable</div><h2>Duplicate</h2></a></main>'
                )
            ),
            http.get('https://lovable.dev/blog/test-inside', () => HttpResponse.html('<article class="prose"><p>Full inside article</p><script>bad()</script></article>'))
        );
        const feed = await lovable(context({}, '1'));
        expect(feed.item).toHaveLength(1);
        expect(feed.item[0].title).toBe('Engineering story');
        expect(feed.item[0].description).toBe('<p>Full inside article</p>');
    });

    it('supports both Cursor card layouts, deduplicates, and expands article bodies', async () => {
        server.use(
            http.get('https://cursor.com/cn/blog/topic/research', () =>
                HttpResponse.html(
                    '<main id="main"></main><main id="main"><a href="/cn/blog/test-wrapped"><article><p>Wrapped card</p><p>Summary</p><time datetime="2026-09-23T00:00:00Z">Localized date</time></article></a><article><a href="/cn/blog/test-nested"><p>Nested card</p><p>Summary</p></a><time datetime="2026-09-22T00:00:00Z"></time></article><a href="/cn/blog/test-wrapped"><article><p>Duplicate</p></article></a></main>'
                )
            ),
            http.get('https://cursor.com/cn/blog/test-wrapped', () => HttpResponse.html('<div class="prose--blog"><p>Full wrapped article</p><script>bad()</script></div>')),
            http.get('https://cursor.com/cn/blog/test-nested', () => HttpResponse.html('<main><article><div class="prose"><p>Full nested article</p></div></article></main>'))
        );
        const feed = await cursor(context({ topic: 'research', locale: 'cn' }));
        expect(feed.item).toHaveLength(2);
        expect(feed.item[0].description).toBe('<p>Full wrapped article</p>');
        expect(feed.item[1].description).toBe('<p>Full nested article</p>');
        expect(new Date(feed.item[0].pubDate!).toISOString()).toBe('2026-09-23T00:00:00.000Z');
    });
});
