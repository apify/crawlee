import { Actor } from 'apify';
import { Dataset, StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new StagehandCrawler({
        stagehandOptions: {
            env: 'LOCAL',
            model: 'anthropic/claude-sonnet-4-20250514',
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
