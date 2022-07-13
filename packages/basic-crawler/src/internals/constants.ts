/**
 * Additional number of seconds used in {@link CheerioCrawler} and {@link BrowserCrawler} to set a reasonable
 * {@link BasicCrawlerOptions.requestHandlerTimeoutSecs|`requestHandlerTimeoutSecs`} for {@link BasicCrawler}
 * that would not impare functionality (not timeout before crawlers).
 */
export const BASIC_CRAWLER_TIMEOUT_BUFFER_SECS = 10;
