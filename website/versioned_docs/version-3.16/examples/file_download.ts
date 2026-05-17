import { FileDownload } from 'crawlee';

// Create a FileDownload - a custom crawler instance that will download files from URLs.
const crawler = new FileDownload({
    async requestHandler({ body, request, contentType, getKeyValueStore }) {
        const url = new URL(request.url);
        const kvs = await getKeyValueStore();

        await kvs.setValue(url.pathname.replace(/\//g, '_'), body, { contentType: contentType.type });
    },
});

// The initial list of URLs to crawl. Here we use just a few hard-coded URLs.
await crawler.addRequests([
    'https://pdfobject.com/pdf/sample.pdf',
    'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg',
]);

// Run the downloader and wait for it to finish.
await crawler.run();

console.log('Crawler finished.');
