/**
 * Abstract class with pre-defined method to connect to the Crawlers class by the "use" crawler method.
 * @category Crawlers
 * @ignore
 */
export declare abstract class CrawlerExtension {
    name: string;
    log: import("@apify/log/log").Log;
    getCrawlerOptions(): Record<string, unknown>;
}
//# sourceMappingURL=crawler_extension.d.ts.map