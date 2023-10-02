import type { Server } from 'http';

import type { RequestQueueOperationOptions, Source } from 'crawlee';
import {
    Configuration,
    RequestQueue,
    puppeteerClickElements,
    launchPuppeteer,
    launchPlaywright,
    playwrightClickElements,
    puppeteerUtils,
    playwrightUtils,
} from 'crawlee';
import type { Browser as PWBrowser, Page as PWPage } from 'playwright';
import type { Browser as PPBrowser, Target } from 'puppeteer';
import { runExampleComServer } from 'test/shared/_helper';

function isPuppeteerBrowser(browser: PPBrowser | PWBrowser): browser is PPBrowser {
    return (browser as PPBrowser).targets !== undefined;
}

function isPlaywrightBrowser(browser: PPBrowser | PWBrowser): browser is PWBrowser {
    return (browser as PWBrowser).browserType !== undefined;
}

const apifyClient = Configuration.getStorageClient();

function createRequestQueueMock() {
    const enqueued: Source[] = [];
    const requestQueue = new RequestQueue({ id: 'xxx', client: apifyClient });

    // @ts-expect-error Override method for testing
    requestQueue.addRequests = async function (requests) {
        enqueued.push(...requests);
        return { processedRequests: requests, unprocessedRequests: [] as never[] };
    };

    return { enqueued, requestQueue };
}

const testCases = [
    {
        caseName: 'Puppeteer',
        launchBrowser: launchPuppeteer,
        clickElements: puppeteerClickElements,
        utils: puppeteerUtils,
    },
    {
        caseName: 'Playwright',
        launchBrowser: launchPlaywright,
        clickElements: playwrightClickElements,
        utils: playwrightUtils,
    },
];

testCases.forEach(({
    caseName,
    launchBrowser,
    clickElements,
    utils,
}) => {
    describe(`${caseName}: enqueueLinksByClickingElements()`, () => {
        let browser: PPBrowser | PWBrowser;
        let server: Server;

        let serverAddress = 'http://localhost:';
        let serverPort: number;
        let page: any;

        beforeAll(async () => {
            [server, serverPort] = await runExampleComServer();
            serverAddress += serverPort;
            browser = await launchBrowser({ launchOptions: { headless: true } });
        });

        afterAll(async () => {
            await browser.close();
            await server.close();
        });

        beforeEach(async () => {
            page = await browser.newPage();
        });

        afterEach(async () => {
            await page.close();
        });

        test('should work', async () => {
            const { enqueued, requestQueue } = createRequestQueueMock();
            const html = `
<html>
    <body>
        <a href="${serverAddress}">link</div>
    </body>
</html>
            `;

            await page.setContent(html);
            await utils.enqueueLinksByClickingElements({
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
            expect(enqueued).toHaveLength(1);
            expect(enqueued[0].url).toMatch(`${serverAddress}/`);
            expect(enqueued[0].uniqueKey).toBe('key');
            expect(page.url()).toBe('about:blank');
        });

        test('accepts forefront option', async () => {
            const addedRequests: {request: Source; options: RequestQueueOperationOptions}[] = [];
            const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getStorageClient() });
            requestQueue.addRequests = async (requests, options) => {
                addedRequests.push(...requests.map((request) => ({ request, options })));
                return { processedRequests: [], unprocessedRequests: [] };
            };

            const html = `
<html>
    <body>
        <a href="https://www.example.com/link1">link1</div>
        <a href="https://www.example.com/link2">link2</div>
    </body>
</html>
            `;

            await page.setContent(html);
            await utils.enqueueLinksByClickingElements({
                page,
                requestQueue,
                selector: 'a',
                waitForPageIdleSecs: 0.025,
                maxWaitForPageIdleSecs: 0.250,
                forefront: true,
            });
            expect(addedRequests).toHaveLength(2);
            expect(addedRequests[0].options.forefront).toBe(true);
            expect(addedRequests[1].options.forefront).toBe(true);
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
                await clickElements.clickElements(page, 'div');
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
                await clickElements.clickElements(page, 'div');
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
                await clickElements.clickElements(page, 'header, div, p, footer');
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
                await clickElements.clickElements(page, 'div');
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
                await clickElements.clickElements(page, 'header, div, main, footer');
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
                await clickElements.clickElements(page, 'div', { clickCount: 2, delay: 100 });
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
                await clickElements.clickElements(page, 'div', { clickCount: 2, delay: 100 });
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
                await clickElements.clickElements(page, 'header, div, p, footer', { clickCount: 2, delay: 100 });
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
                await clickElements.clickElements(page, 'div', { clickCount: 2, delay: 100 });
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
                await clickElements.clickElements(page, 'header, div, main, footer', { clickCount: 2, delay: 100 });
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
                await clickElements.clickElements(page, 'textarea', { clickCount: 3, delay: 100 });
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
        <a href="${serverAddress}">link</div>
    </body>
</html>
            `;
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts({
                    selector: 'a',
                }));
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toMatch(`${serverAddress}/`);
                expect(page.url()).toBe('about:blank');
            });

            test('should intercept navigation with window.location', async () => {
                const html = `
<html>
    <body>
        <div onclick="return window.location = '${serverAddress}'">div</div>
    </body>
</html>
            `;
                await page.goto(serverAddress);
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts());
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toMatch(`${serverAddress}/`);
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
                await page.goto(serverAddress);
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts());
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toBe(`${serverAddress}/#foo`);
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
                await page.goto(serverAddress);
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts());
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toMatch(`${serverAddress}/`);
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
                await page.goto(serverAddress);
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts());
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toMatch(`${serverAddress}/`);
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
                await page.goto(serverAddress);
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts());
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
                await page.goto(`${serverAddress}/bar/`);
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts());
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toBe(`${serverAddress}/bar/foo`);
                const pageContent = await page.content();
                expect(pageContent).toMatch('onclick="return window.history.pushState');
            });

            test.skip('should close newly opened tabs', async () => {
                const html = `
<html>
    <body>
        <div onclick="return window.open('${serverAddress}');">div</div>
    </body>
</html>
            `;
                await page.setContent(html);
                const callCounts = await new Promise<{ create: number; destroy: number }>((resolve) => {
                    if (isPuppeteerBrowser(browser)) {
                        let spawnedTarget: Target;
                        const counts = {
                            create: 0,
                            destroy: 0,
                        };
                        (browser as PPBrowser).on('targetcreated', (target) => {
                            counts.create++;
                            if ((clickElements as typeof puppeteerClickElements).isTargetRelevant(page, target)) spawnedTarget = target;
                        });
                        browser.on('targetdestroyed', (target) => {
                            counts.destroy++;
                            if (spawnedTarget === target) resolve(counts);
                        });
                    }

                    if (isPlaywrightBrowser(browser)) {
                        const counts = {
                            create: 0,
                            destroy: 0,
                        };
                        page.on('popup', (target: PWPage) => {
                            counts.create++;
                            target.on('close', () => {
                                counts.destroy++;
                                resolve(counts);
                            });
                        });
                    }

                    clickElements.clickElementsAndInterceptNavigationRequests(getOpts({
                        waitForPageIdleMillis: 1000,
                        maxWaitForPageIdleMillis: 5000,
                    })).catch(() => { /* will throw because afterEach will close the page */ });
                });

                expect(callCounts.create).toBe(1);
                expect(callCounts.destroy).toBe(1);
                const pageContent = await page.content();
                expect(pageContent).toMatch('onclick="return window.open(');
            });

            test.skip('should save urls from newly opened tabs', async () => {
                const html = `
<html>
    <body>
        <div onclick="return window.open('${serverAddress}');">div</div>
    </body>
</html>
            `;
                await page.setContent(html);
                const interceptedRequests = await clickElements.clickElementsAndInterceptNavigationRequests(getOpts({
                    waitForPageIdleMillis: 1000,
                    maxWaitForPageIdleMillis: 5000,
                }));
                await new Promise((r) => setTimeout(r, 1000));
                expect(interceptedRequests).toHaveLength(1);
                expect(interceptedRequests[0].url).toBe(`${serverAddress}/`);
                const pageContent = await page.content();
                expect(pageContent).toMatch('onclick="return window.open(');
            });
        });
    });
});
