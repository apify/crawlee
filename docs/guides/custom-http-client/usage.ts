const crawler = new HttpCrawler({
    httpClient: new CustomHttpClient(),
    async requestHandler() {
        /* ... */
    },
});
