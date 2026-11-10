import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { StagehandCrawler } = await import('@crawlee/stagehand');
    const { Actor } = await import('apify');
    const { z } = await import('zod');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new StagehandCrawler({
            stagehandOptions: {
                env: 'LOCAL',
                model: 'anthropic/claude-haiku-4-5-20251001',
                verbose: 0,
            },
            maxRequestsPerCrawl: 1,
            async requestHandler({ page, request, log, pushData }) {
                log.info(`Processing ${request.loadedUrl}`);
                const codeJs = await page.extract('read the source code of the example usage', z.string());
                await page.act('switch the code tab to python example');
                const codePython = await page.extract('read the source code of the example usage', z.string());

                log.info(`Extracted code for JS: ${codeJs}`);
                log.info(`Extracted code for Python: ${codePython}`);
                await pushData({ url: request.loadedUrl, codeJs, codePython });
            },
        });

        await crawler.run(['https://crawlee.dev']);
    }, mainOptions);
};

test.skipIf(!process.env.ANTHROPIC_API_KEY)('stagehand-claude', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('stagehand-claude', {
        source: scenario(import.meta.filename, main, { image: 'playwright' }),
        memory: 16384,
        env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(stats.requestsSucceeded).toBe(1);
    expect(items).toHaveLength(1);
    expect(validateDataset(items, ['url', 'codeJs', 'codePython'])).toBe(true);
    expect(items[0].codeJs.length).toBeGreaterThan(0);
    expect(items[0].codePython.length).toBeGreaterThan(0);
});
