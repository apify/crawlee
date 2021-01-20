import { EventEmitter } from 'events';
import log from './utils_log';
import { main, getEnv, call, callTask, metamorph, addWebhook } from './actor';
import AutoscaledPool from './autoscaling/autoscaled_pool';
import BasicCrawler from './crawlers/basic_crawler';
import CheerioCrawler from './crawlers/cheerio_crawler';
import { pushData, openDataset } from './storages/dataset';
import events, { initializeEvents, stopEvents } from './events';
import { getValue, setValue, getInput, openKeyValueStore } from './storages/key_value_store';
import { launchPuppeteer } from './browser_launchers/puppeteer_launcher';
import { launchPlaywright } from './browser_launchers/playwright_launcher';
import BrowserCrawler from './crawlers/browser_crawler';
import PuppeteerCrawler from './crawlers/puppeteer_crawler';
import PlaywrightCrawler from './crawlers/playwright_crawler';
import Request from './request';
import { RequestList, openRequestList } from './request_list';
import { createProxyConfiguration } from './proxy_configuration';
import { openRequestQueue } from './storages/request_queue';
import { newClient, getMemoryInfo, isAtHome, publicUtils } from './utils';
import { puppeteerUtils } from './puppeteer_utils';
import { playwrightUtils } from './playwright_utils';
import { socialUtils } from './utils_social';
import { enqueueLinks } from './enqueue_links/enqueue_links';
import PseudoUrl from './pseudo_url';
import LiveViewServer from './live_view/live_view_server';
import { requestAsBrowser } from './utils_request';
import { openSessionPool } from './session_pool/session_pool';
import { Session } from './session_pool/session';

// Increase the global limit for event emitter memory leak warnings.
EventEmitter.defaultMaxListeners = 50;

const exportedUtils = Object.assign(publicUtils, {
    puppeteer: puppeteerUtils,
    playwright: playwrightUtils,
    social: socialUtils,
    log,
    enqueueLinks,
    requestAsBrowser,
});

/**
 * The following section describes all functions and properties provided by the `apify` package,
 * except individual classes and namespaces that have their separate, detailed, documentation pages
 * accessible from the left sidebar. To learn how Apify SDK works, we suggest following
 * the [Getting Started](../guides/getting-started) tutorial.
 *
 * **Important:**
 * > The following functions: `addWebhook`, `call`, `callTask` and `newClient` invoke features of the
 * > [Apify platform](../guides/apify-platform) and require your scripts to be authenticated.
 * > See the [authentication guide](../guides/apify-platform#logging-into-apify-platform-from-apify-sdk) for instructions.
 *
 * @module Apify
 */
export {
    main,
    getEnv,
    call,
    callTask,
    metamorph,
    getMemoryInfo,
    isAtHome,
    newClient,
    addWebhook,

    AutoscaledPool,

    BasicCrawler,

    CheerioCrawler,

    pushData,
    openDataset,

    events,
    initializeEvents,
    stopEvents,

    getValue,
    setValue,
    getInput,
    openKeyValueStore,

    launchPuppeteer,
    launchPlaywright,
    BrowserCrawler,
    PuppeteerCrawler,
    PlaywrightCrawler,

    PseudoUrl,

    Request,
    RequestList,
    openRequestList,
    openRequestQueue,

    openSessionPool,

    createProxyConfiguration,

    LiveViewServer,
    Session,

    exportedUtils as utils,
};
