import { open } from 'node:fs/promises';

import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    // Runs before navigation, so `$` and `response` are not available here yet.
    extendContext: async (context) => {
        const file = await open(`${context.request.url.replace(/[^a-z0-9]/gi, '_')}.log`, 'a');
        // Closed once the request is done, including after a failure.
        context.registerDeferredCleanup(() => file.close());

        return {
            async note(line: string) {
                await file.appendFile(`${line}\n`);
            },
        };
    },
    async requestHandler({ note, $, enqueueLinks }) {
        await note(`title: ${$('title').text()}`);
        await enqueueLinks();
    },
});

await crawler.run(['https://crawlee.dev']);
