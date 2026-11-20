import { testActor } from 'apify-test-tools';
import { describe } from 'vitest';

import { getStats, scenario, validateDataset } from './harness.js';

export const main = async () => {
    const { StagehandCrawler } = await import('@crawlee/stagehand');
    const { Actor } = await import('apify');
    const { z } = await import('zod');

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
    });
};

const actor = scenario('stagehand-claude', import.meta.filename, main, {
    image: 'playwright',
    memory: 16384,
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('needs ANTHROPIC_API_KEY', () => {
    testActor(actor, 'drives the page with Claude', async ({ expect, run }) => {
        const result = await run();
        const stats = await getStats(result);
        const { items } = await result.getDataset<any>();

        expect(result.status).toBe('SUCCEEDED');
        expect(stats.requestsSucceeded).toBe(1);
        expect(items).toHaveLength(1);
        expect(validateDataset(items, ['url', 'codeJs', 'codePython'])).toBe(true);
        expect(items[0].codeJs.length).toBeGreaterThan(0);
        expect(items[0].codePython.length).toBeGreaterThan(0);
    });
});
