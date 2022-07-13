import type { Request, RequestOptions } from 'crawlee';
import {
    RequestQueue,
    puppeteerClickElements,
    launchPuppeteer,
    utils,
} from 'crawlee';
import type { Browser, Page, Target } from 'puppeteer';

const { clickElements, clickElementsAndInterceptNavigationRequests, isTargetRelevant } = puppeteerClickElements;

describe('enqueueLinksByClickingElements()', () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        browser = await launchPuppeteer({ launchOptions: { headless: true } });
    });

    afterAll(async () => {
        await browser.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();
    });

    afterEach(async () => {
        await page.close();
    });

    test('should work', async () => {
        const addedRequests: (Request | RequestOptions)[] = [];
        const requestQueue = Object.create(RequestQueue.prototype);
        requestQueue.addRequests = async (request: Request[]) => addedRequests.push(...request);
        const html = `
<html>
    <body>
        <a href="https://example.com">link</div>
    </body>
</html>
        `;

        await page.setContent(html);
        await utils.puppeteer.enqueueLinksByClickingElements({
            page,
            requestQueue,
            selector: 'a',
            transformRequestFunction: (request) => {
                request.uniqueKey = 'key';
                return request;
            },
            waitForPageIdleSecs: 0.025,
            maxWaitForPageIdleSecs: 0.250,
        });
        expect(addedRequests).toHaveLength(1);
        expect(addedRequests[0].url).toMatch(/https:\/\/example\.com\/?$/);
        expect(addedRequests[0].uniqueKey).toBe('key');
        expect(page.url()).toBe('about:blank');
    });

    describe('clickElements()', () => {
        test('should click an element', async () => {
            const html = `
<html>
    <body>
        <div onclick="window.clicked = true;">div</div>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'div');
            // @ts-expect-error Custom property
            const wasClicked = await page.evaluate(() => window.clicked);
            expect(wasClicked).toBe(true);
        });

        test('should click an empty element', async () => {
            const html = `
<html>
    <body>
        <div onclick="window.clicked = true;"></div>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'div');
            // @ts-expect-error Custom property
            const wasClicked = await page.evaluate(() => window.clicked);
            expect(wasClicked).toBe(true);
        });
        test('should click multiple elements', async () => {
            const html = `
<html>
    <script>
        window.clickedElements = [];
        window.handleClick = (evt) => window.clickedElements.push(evt.target.nodeName);
    </script>
    <body>
        <header onclick="return window.handleClick(event)"></header>
        <div onclick="return window.handleClick(event)"></div>
        <p onclick="return window.handleClick(event)"></p>
        <footer onclick="return window.handleClick(event)"></footer>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'header, div, p, footer');
            // @ts-expect-error Custom property
            const clickedElements = await page.evaluate(() => window.clickedElements);
            expect(clickedElements).toEqual(['HEADER', 'DIV', 'P', 'FOOTER']);
        });

        test('should click hidden elements', async () => {
            const html = `
<html>
    <body>
        <div onclick="window.clicked = true;" style="visibility: hidden; display: none"></div>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'div');
            // @ts-expect-error Custom property
            const wasClicked = await page.evaluate(() => window.clicked);
            expect(wasClicked).toBe(true);
        });

        test('should click elements stacked on top of each other', async () => {
            const html = `
<html>
    <script>
        window.clickedElements = [];
        window.handleClick = (evt) => window.clickedElements.push(evt.target.nodeName);
    </script>
    <body>
        <header onclick="return window.handleClick(event)" style="position: absolute; z-index: auto">header</header>
        <div onclick="return window.handleClick(event)" style="position: absolute; z-index: 1">div</div>
        <main onclick="return window.handleClick(event)" style="position: absolute; z-index: 2">main</main>
        <footer onclick="return window.handleClick(event)" style="position: absolute; z-index: 3">footer</footer>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'header, div, main, footer');
            // @ts-expect-error Custom property
            const clickedElements = await page.evaluate(() => window.clickedElements);
            expect(clickedElements).toEqual(['HEADER', 'DIV', 'MAIN', 'FOOTER']);
        });
    });

    describe('double clickElements()', () => {
        test('should double click an element', async () => {
            const html = `
<html>
    <body>
        <div ondblclick="window.clicked = true;">div</div>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'div', { clickCount: 2, delay: 100 });
            const wasClicked = await page.evaluate(() => (window as any).clicked);
            expect(wasClicked).toBe(true);
        });

        test('should double click an empty element', async () => {
            const html = `
<html>
    <body>
        <div ondblclick="window.clicked = true;"></div>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'div', { clickCount: 2, delay: 100 });
            const wasClicked = await page.evaluate(() => (window as any).clicked);
            expect(wasClicked).toBe(true);
        });
        test('should double click multiple elements', async () => {
            const html = `
<html>
    <script>
        window.clickedElements = [];
        window.handleClick = (evt) => window.clickedElements.push(evt.target.nodeName);
    </script>
    <body>
        <header ondblclick="return window.handleClick(event)"></header>
        <div ondblclick="return window.handleClick(event)"></div>
        <p ondblclick="return window.handleClick(event)"></p>
        <footer ondblclick="return window.handleClick(event)"></footer>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'header, div, p, footer', { clickCount: 2, delay: 100 });
            const clickedElements = await page.evaluate(() => (window as any).clickedElements);
            expect(clickedElements).toEqual(['HEADER', 'DIV', 'P', 'FOOTER']);
        });

        test('should double click hidden elements', async () => {
            const html = `
<html>
    <body>
        <div ondblclick="window.clicked = true;" style="visibility: hidden; display: none"></div>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'div', { clickCount: 2, delay: 100 });
            const wasClicked = await page.evaluate(() => (window as any).clicked);
            expect(wasClicked).toBe(true);
        });

        test('should click elements stacked on top of each other', async () => {
            const html = `
<html>
    <script>
        window.clickedElements = [];
        window.handleClick = (evt) => window.clickedElements.push(evt.target.nodeName);
    </script>
    <body>
        <header ondblclick="return window.handleClick(event)" style="position: absolute; z-index: auto">header</header>
        <div ondblclick="return window.handleClick(event)" style="position: absolute; z-index: 1">div</div>
        <main ondblclick="return window.handleClick(event)" style="position: absolute; z-index: 2">main</main>
        <footer ondblclick="return window.handleClick(event)" style="position: absolute; z-index: 3">footer</footer>
    </body>
</html>
        `;
            await page.setContent(html);
            await clickElements(page, 'header, div, main, footer', { clickCount: 2, delay: 100 });
            const clickedElements = await page.evaluate(() => (window as any).clickedElements);
            expect(clickedElements).toEqual(['HEADER', 'DIV', 'MAIN', 'FOOTER']);
        });
    });

    describe('select line with triple clickElements()', () => {
        test('should select the text by triple clicking', async () => {
            const html = `
<html>
    <body>
        <textarea></textarea>
    </body>
</html>
        `;
            await page.setContent(html);
            await page.focus('textarea');
            const text = "This is the text that we are going to try to select. Let's see how it goes.";
            await page.keyboard.type(text);
            await clickElements(page, 'textarea', { clickCount: 3, delay: 100 });
            expect(
                await page.evaluate(() => {
                    const textarea = document.querySelector('textarea');
                    return textarea.value.substring(
                        textarea.selectionStart,
                        textarea.selectionEnd,
                    );
                }),
            ).toBe(text);
        });
    });

    describe('clickElementsAndInterceptNavigationRequests()', () => {
        function getOpts(overrides = {}) {
            return {
                page,
                selector: 'div',
                waitForPageIdleMillis: 25,
                maxWaitForPageIdleMillis: 250,
                ...overrides,
            };
        }

        test('should intercept navigation by clicking a link', async () => {
            const html = `
<html>
    <body>
        <a href="https://example.com">link</div>
    </body>
</html>
        `;
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts({
                selector: 'a',
            }));
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toMatch(/https:\/\/example\.com\/?$/);
            expect(page.url()).toBe('about:blank');
        });

        test('should intercept navigation with window.location', async () => {
            const html = `
<html>
    <body>
        <div onclick="return window.location = 'https://example.com'">div</div>
    </body>
</html>
        `;
            await page.goto('https://example.com');
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts());
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toMatch(/https:\/\/example\.com\/?$/);
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.location = ');
        });

        test('should save the hash when changing it with window.location', async () => {
            const html = `
    <html>
        <body>
            <div onclick="return window.location = '#foo'">div</div>
        </body>
    </html>
            `;
            await page.goto('https://example.com');
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts());
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toBe('https://example.com/#foo');
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.location = ');
        });

        test('should prevent reload from cache with window.reload()', async () => {
            const html = `
<html>
    <body>
        <div onclick="return window.location.reload()">div</div>
    </body>
</html>
        `;
            await page.goto('https://example.com');
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts());
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toMatch(/https:\/\/example\.com\/?$/);
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.location.reload()');
        });

        test('should prevent forced reload with window.reload(true)', async () => {
            const html = `
<html>
    <body>
        <div onclick="return window.location.reload(true)">div</div>
    </body>
</html>
        `;
            await page.goto('https://example.com');
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts());
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toMatch(/https:\/\/example\.com\/?$/);
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.location.reload(true)');
        });

        test('should prevent manipulation with window.history', async () => {
            const html = `
<html>
    <script>
        window.handleClick = () => {
            window.history.go(1)
            window.history.forward();
            window.history.go()
            window.history.back();
            window.history.go(-1)
            if (window.history.length !== 0) throw new Error('history.length is not 0')
        }
    </script>
    <body>
        <div onclick="return handleClick();">div</div>
    </body>
</html>
        `;
            await page.goto('https://example.com');
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts());
            expect(interceptedRequests).toHaveLength(0);
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return handleClick();');
        });

        test('should save urls pushed to window.history', async () => {
            const html = `
<html>
    <body>
        <div onclick="return window.history.pushState({}, '', 'foo');">div</div>
    </body>
</html>
        `;
            await page.goto('https://example.com/bar/');
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts());
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toBe('https://example.com/bar/foo');
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.history.pushState');
        });

        test('should close newly opened tabs', async () => {
            const html = `
<html>
    <body>
        <div onclick="return window.open('https://example.com');">div</div>
    </body>
</html>
        `;
            await page.setContent(html);
            const callCounts = await new Promise<{ create: number; destroy: number }>((resolve) => {
                let spawnedTarget: Target;
                const counts = {
                    create: 0,
                    destroy: 0,
                };
                browser.on('targetcreated', (target) => {
                    counts.create++;
                    if (isTargetRelevant(page, target)) spawnedTarget = target;
                });
                browser.on('targetdestroyed', (target) => {
                    counts.destroy++;
                    if (spawnedTarget === target) resolve(counts);
                });
                clickElementsAndInterceptNavigationRequests(getOpts({
                    waitForPageIdleMillis: 1000,
                    maxWaitForPageIdleMillis: 5000,
                })).catch(() => { /* will throw because afterEach will close the page */ });
            });

            expect(callCounts.create).toBe(1);
            expect(callCounts.destroy).toBe(1);
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.open(');
        });

        test('should save urls from newly opened tabs', async () => {
            const html = `
<html>
    <body>
        <div onclick="return window.open('https://example.com');">div</div>
    </body>
</html>
        `;
            await page.setContent(html);
            const interceptedRequests = await clickElementsAndInterceptNavigationRequests(getOpts({
                waitForPageIdleMillis: 1000,
                maxWaitForPageIdleMillis: 5000,
            }));
            await new Promise((r) => setTimeout(r, 1000));
            expect(interceptedRequests).toHaveLength(1);
            expect(interceptedRequests[0].url).toBe('https://example.com/');
            const pageContent = await page.content();
            expect(pageContent).toMatch('onclick="return window.open(');
        });
    });
});
