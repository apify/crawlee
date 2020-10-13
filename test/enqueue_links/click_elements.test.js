import Apify from '../../build';
import { RequestQueue } from '../../build/storages/request_queue';
import { clickElements, clickElementsAndInterceptNavigationRequests, isTargetRelevant } from '../../build/enqueue_links/click_elements';

describe('enqueueLinksByClickingElements()', () => {
    let browser;
    let page;

    beforeAll(async () => {
        browser = await Apify.launchPuppeteer({ headless: true });
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
        const addedRequests = [];
        const requestQueue = Object.create(RequestQueue.prototype);
        requestQueue.addRequest = async (request) => addedRequests.push(request);
        const html = `
<html>
    <body>
        <a href="https://example.com">link</div>
    </body>
</html>
        `;

        await page.setContent(html);
        await Apify.utils.puppeteer.enqueueLinksByClickingElements({
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
            const clickedElements = await page.evaluate(() => window.clickedElements);
            expect(clickedElements).toEqual(['HEADER', 'DIV', 'MAIN', 'FOOTER']);
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

        test(
            'should save the hash when changing it with window.location',
            async () => {
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
            },
        );

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
            const callCounts = await new Promise((resolve) => {
                let spawnedTarget;
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
