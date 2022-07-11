import { EventEmitter } from "events";
import { performance } from "perf_hooks";

class CrawlEmitter extends EventEmitter {}

const crawlEmitter = new CrawlEmitter();

const crawlTrackingEmitter = new CrawlEmitter();

crawlEmitter.setMaxListeners(0);
crawlTrackingEmitter.setMaxListeners(0);

// TODO: add host parsing for subdomains and tld crawls
const extractHostname = (domain, pages) => {
    if (domain) {
        return domain;
    }
    return "";
};

// get a key for the event based on domain and uid.
export const getKey = (domain, pages, user_id) => {
    return `${extractHostname(domain, pages)}-${user_id || 0}`;
};

// remove key from object
export const removeKey = (key, { [key]: _, ...rest }) => rest;

/*  Emit events to track crawling progress.
 *  This mainly tracks at a higher level the progress between the gRPC crawling across modules.
 *  TODO: allow configuring a url and passing in optional Promise handling.
 *  @param url: scope the events to track one domain
 */
export const establishCrawlTracking = () => {
    // track when a new website starts and determine page completion
    let crawlingSet = {};

    crawlTrackingEmitter.on("crawl-start", (target) => {
        const key = getKey(target.domain, target.pages, target.user_id);

        // set the item for tracking
        if (!crawlingSet[key]) {
            crawlingSet[key] = {
                total: 0,
                current: 0,
                crawling: true,
                duration: performance.now(),
            };
        }
    });

    // track total amount of pages in a website.
    crawlTrackingEmitter.on("crawl-processing", (target) => {
        // process a new item tracking count
        const key = getKey(target.domain, target.pages, target.user_id);

        if (crawlingSet[key] && crawlingSet[key].crawling) {
            crawlingSet[key].total = crawlingSet[key].total + 1;
        }
    });

    // track the amount of pages the website should have and determine if complete.
    crawlTrackingEmitter.on("crawl-processed", (target) => {
        // process a new item tracking count
        const userId = target.user_id;
        const key = getKey(target.domain, target.pages, userId);

        if (crawlingSet[key]) {
            crawlingSet[key].current = crawlingSet[key].current + 1;
            if (
                crawlingSet[key].current === crawlingSet[key].total &&
                !crawlingSet[key].crawling
            ) {
                crawlingSet[key].duration =
                    performance.now() - crawlingSet[key].duration;

                crawlTrackingEmitter.emit(`crawl-complete-${key}`, target);

                console.log(`target processing ${target}`);

                // TODO: perform page event

                // Crawl completed
                crawlingSet = removeKey(key, crawlingSet);
            }
        }
    });

    // track when the crawler has processed the pages and sent.
    crawlTrackingEmitter.on("crawl-complete", (target) => {
        const userId = target.user_id;
        const key = getKey(target.domain, target.pages, userId);

        if (crawlingSet[key]) {
            crawlingSet[key].crawling = false;

            if (crawlingSet[key].current === crawlingSet[key].total) {
                crawlingSet[key].duration =
                    performance.now() - crawlingSet[key].duration;
                crawlTrackingEmitter.emit(`crawl-complete-${key}`, target);

                // PERFORM SHUT DOWN EVENTS

                // Crawl completed
                crawlingSet = removeKey(key, crawlingSet);
            }
        }
    });
};

export { crawlTrackingEmitter, crawlEmitter };
