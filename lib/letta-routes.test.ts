import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { route as blogRoute } from './routes/letta/blog';
import { route as researchRoute } from './routes/letta/research';
import { publicationDate } from './routes/letta/utils';

vi.mock('@/utils/cache', () => ({ default: { tryGet: (_key: string, loader: () => Promise<unknown>) => loader() } }));

describe('/letta', () => {
    it.each([
        ['2026-09-28', '2026-09-28'],
        ['PRODUCT — SEP 28, 2026', '2026-09-28'],
        ['RESEARCH — JUL 28, 2026', '2026-07-28'],
        ['Letta Research · October 2026', '2026-10-01'],
        ['2023/10/12', '2023-10-12'],
    ])('uses source dates independent of the server timezone: %s', (source, expected) => {
        expect(publicationDate(source)?.toISOString()).toBe(`${expected}T00:00:00.000Z`);
    });

    it.each(['', 'invalid', '2026-02-30', '2026-13-01'])('does not replace missing or invalid dates with today: %s', (source) => {
        expect(publicationDate(source)).toBeUndefined();
    });

    it('fetches Blog detail dates and full content, preserving media, tables and code but removing site UI', async () => {
        const { default: server } = await import('@/setup.test');
        let detailRequests = 0;
        const card = '<a class="pub" href="/blog/test-workflows/"><span class="pub__title">Workflows</span><span class="pub__date">PRODUCT — SEP 2026</span><p>Summary only</p></a>';
        server.use(
            http.get('https://www.letta.com/blog/', () => HttpResponse.html(card + card)),
            http.get('https://www.letta.com/blog/test-workflows/', () => {
                detailRequests++;
                return HttpResponse.html(`<meta property="article:published_time" content="2026-09-28">
                    <article class="post"><nav>Contents</nav><h2>Actual article</h2><p>Full paragraph absent from the listing.</p>
                    <img src="/images/chart.png"><a href="/docs/">Docs</a><table><tr><td>Result</td></tr></table>
                    <pre><code>const agents = 5;</code><button>Copy code</button></pre>
                    <section class="subscribe"><form>MAILING LIST</form></section><script>tracking()</script></article>`);
            })
        );
        const feed = await blogRoute.handler();
        expect(feed.title).toBe('Letta Blog');
        expect(feed.item).toHaveLength(1);
        expect(detailRequests).toBe(1);
        const item = feed.item[0];
        expect(item.pubDate.toISOString()).toBe('2026-09-28T00:00:00.000Z');
        expect(item.description).toContain('Full paragraph absent from the listing.');
        expect(item.description).toContain('src="https://www.letta.com/images/chart.png"');
        expect(item.description).toContain('href="https://www.letta.com/docs/"');
        expect(item.description).toContain('<table>');
        expect(item.description).toContain('<code>const agents = 5;</code>');
        expect(item.description).not.toMatch(/Summary only|Contents|Copy code|MAILING LIST|tracking/);
    });

    it('includes external Research articles and arXiv full HTML with first-submission dates', async () => {
        const { default: server } = await import('@/setup.test');
        server.use(
            http.get('https://www.letta.com/research/', () =>
                HttpResponse.html(`<a class="pub" href="https://www.frontiermemory.com/blog/v1/"><span class="pub__title">FrontierMemory</span><span class="pub__date">OCT 2026</span></a>
                    <a class="pub" href="https://arxiv.org/abs/2310.08560"><span class="pub__title">MemGPT</span><span class="pub__date">OCT 2023</span></a>`)
            ),
            http.get('https://www.frontiermemory.com/blog/v1/', () =>
                HttpResponse.html('<article class="post"><header class="post-header"><h1>FrontierMemory</h1><p class="post-byline">Letta Research · October 2026</p></header><p>Complete benchmark analysis.</p></article>')
            ),
            http.get('https://arxiv.org/abs/2310.08560', () =>
                HttpResponse.html(`<meta name="citation_date" content="2023/10/12"><meta name="citation_online_date" content="2024/02/12">
                    <meta name="citation_pdf_url" content="https://arxiv.org/pdf/2310.08560"><a id="latexml-download-link" href="/html/2310.08560v2">HTML</a>`)
            ),
            http.get('https://arxiv.org/html/2310.08560v2', () => HttpResponse.html('<article class="ltx_document"><h1>MemGPT</h1><div class="ltx_authors">Authors</div><h2>Experiments</h2><p>The complete paper.</p></article>'))
        );
        const feed = await researchRoute.handler();
        expect(feed.item).toHaveLength(2);
        expect(feed.item[0].pubDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(feed.item[0].description).toBe('<p>Complete benchmark analysis.</p>');
        expect(feed.item[1].pubDate.toISOString()).toBe('2023-10-12T00:00:00.000Z');
        expect(feed.item[1].description).toContain('The complete paper.');
        expect(feed.item[1].description).not.toContain('Authors');
        expect(feed.item[1].enclosure_url).toBe('https://arxiv.org/pdf/2310.08560');
    });

    it('fails visibly instead of silently publishing a summary when article extraction breaks', async () => {
        const { default: server } = await import('@/setup.test');
        server.use(
            http.get('https://www.letta.com/blog/', () => HttpResponse.html('<a class="pub" href="/blog/broken/"><span class="pub__title">Broken</span><span class="pub__date">SEP 2026</span><p>Summary</p></a>')),
            http.get('https://www.letta.com/blog/broken/', () => HttpResponse.html('<meta property="article:published_time" content="2026-09-28"><main>Changed markup</main>'))
        );
        await expect(blogRoute.handler()).rejects.toThrow('Letta article content is missing');
    });
});
