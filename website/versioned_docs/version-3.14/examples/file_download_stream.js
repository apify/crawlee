"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
const crawlee_1 = require("crawlee");
// A sample Transform stream logging the download progress.
function createProgressTracker({ url, log, totalBytes }) {
    let downloadedBytes = 0;
    return new stream_1.Transform({
        transform(chunk, _, callback) {
            if (downloadedBytes % 1e6 > (downloadedBytes + chunk.length) % 1e6) {
                log.info(`Downloaded ${downloadedBytes / 1e6} MB (${Math.floor((downloadedBytes / totalBytes) * 100)}%) for ${url}.`);
            }
            downloadedBytes += chunk.length;
            this.push(chunk);
            callback();
        },
    });
}
// Create a FileDownload - a custom crawler instance that will download files from URLs.
const crawler = new crawlee_1.FileDownload({
    async streamHandler({ stream, request, log, getKeyValueStore }) {
        const url = new URL(request.url);
        log.info(`Downloading ${url} to ${url.pathname.replace(/\//g, '_')}...`);
        await new Promise((resolve, reject) => {
            // With the 'response' event, we have received the headers of the response.
            stream.on('response', async (response) => {
                const kvs = await getKeyValueStore();
                await kvs.setValue(url.pathname.replace(/\//g, '_'), (0, stream_1.pipeline)(stream, createProgressTracker({ url, log, totalBytes: Number(response.headers['content-length']) }), (error) => {
                    if (error)
                        reject(error);
                }), { contentType: response.headers['content-type'] });
                log.info(`Downloaded ${url} to ${url.pathname.replace(/\//g, '_')}.`);
                resolve();
            });
        });
    },
});
// The initial list of URLs to crawl. Here we use just a few hard-coded URLs.
await crawler.addRequests([
    'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v',
]);
// Run the downloader and wait for it to finish.
await crawler.run();
