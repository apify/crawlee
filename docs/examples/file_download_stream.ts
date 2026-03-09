import { pipeline, Transform } from 'stream';

import { FileDownload, type CrawleeLogger } from 'crawlee';

// A sample Transform stream logging the download progress.
function createProgressTracker({ url, log, totalBytes }: { url: URL; log: CrawleeLogger; totalBytes: number }) {
    let downloadedBytes = 0;

    return new Transform({
        transform(chunk, _, callback) {
            if (downloadedBytes % 1e6 > (downloadedBytes + chunk.length) % 1e6) {
                log.info(
                    `Downloaded ${downloadedBytes / 1e6} MB (${Math.floor((downloadedBytes / totalBytes) * 100)}%) for ${url}.`,
                );
            }
            downloadedBytes += chunk.length;

            this.push(chunk);
            callback();
        },
    });
}

// Create a FileDownload - a custom crawler instance that will download files from URLs.
const crawler = new FileDownload({
    async requestHandler({ response, request, log, getKeyValueStore }) {
        const url = new URL(request.url);

        log.info(`Downloading ${url} to ${url.pathname.replace(/\//g, '_')}...`);

        if (!response.body) return;

        const kvs = await getKeyValueStore();
        await kvs.setValue(
            url.pathname.replace(/\//g, '_'),
            pipeline(
                response.body,
                createProgressTracker({ url, log, totalBytes: Number(response.headers.get('content-length')) }),
                (error) => {
                    if (error) log.error(`Failed to download ${url}: ${error.message}`);
                },
            ),
            response.headers.get('content-type') ? { contentType: response.headers.get('content-type')! } : {},
        );

        log.info(`Downloaded ${url} to ${url.pathname.replace(/\//g, '_')}.`);
    },
});

// The initial list of URLs to crawl. Here we use just a few hard-coded URLs.
await crawler.addRequests([
    'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v',
]);

// Run the downloader and wait for it to finish.
await crawler.run();
