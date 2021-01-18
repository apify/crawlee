import defaultLog from '../utils_log';

/**
 * Abstract class with pre-defined method to connect to the Crawlers class by the "use" crawler method.
 * @ignore
 */
export default class CrawlerExtension {
    constructor() {
        this.name = this.constructor.name;
        this.log = defaultLog.child({ prefix: this.name });
    }

    getCrawlerOptions() {
        throw new Error(`${this.name} has not implemented "getCrawlerOptions" method.`);
    }
}
