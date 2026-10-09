import type { BasicCrawlerOptions, CleanupRegistrar, CrawlingContext } from 'crawlee';
import { BasicCrawler, ContextPipeline } from 'crawlee';

interface TimedCrawlingContext extends CrawlingContext {
    elapsedMillis: () => number;
}

class TimedCrawler<
    ContextExtension = Record<string, never>,
    ExtendedContext extends TimedCrawlingContext = TimedCrawlingContext & ContextExtension,
> extends BasicCrawler<TimedCrawlingContext, ContextExtension, ExtendedContext> {
    constructor(
        options: Omit<
            BasicCrawlerOptions<TimedCrawlingContext, ContextExtension, ExtendedContext>,
            'contextPipelineBuilder'
        > = {},
    ) {
        super({
            ...options,
            contextPipelineBuilder: () =>
                ContextPipeline.create<CrawlingContext>().compose(this.#startTimer.bind(this)),
        });
    }

    #startTimer(context: CrawlingContext, onCleanup: CleanupRegistrar) {
        const startedAt = Date.now();

        onCleanup((error) => {
            context.log.info(`${context.request.url} took ${Date.now() - startedAt} ms`, { failed: !!error });
        });

        return { elapsedMillis: () => Date.now() - startedAt };
    }
}

const crawler = new TimedCrawler({
    async requestHandler({ request, elapsedMillis, log }) {
        log.info(`Hello from ${request.url} after ${elapsedMillis()}ms since the start of processing`);
    },
});

await crawler.run(['https://crawlee.dev', 'https://crawlee.dev/js']);
