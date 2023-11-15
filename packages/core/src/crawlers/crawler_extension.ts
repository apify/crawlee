import { log as defaultLog, type Log } from '../log';

/**
 * Abstract class with pre-defined method to connect to the Crawlers class by the "use" crawler method.
 * @category Crawlers
 * @ignore
 */
export abstract class CrawlerExtension {
    name = this.constructor.name;
    log: Log = defaultLog.child({ prefix: this.name });

    getCrawlerOptions(): Record<string, unknown> {
        throw new Error(`${this.name} has not implemented "getCrawlerOptions" method.`);
    }
}
