
/**
 * Abstract class with pre-defined method to connect to the Crawlers class by the "use" crawler method.
 */
export default class CrawlerExtension {
    constructor(options) {
        this.name = options.name;
    }

    getCrawlerOptions() {
        throw new Error(`${this.name} has not implemented "getCrawlerOptions" method.`);
    }
}
