import { EventEmitter } from 'events';
import log from './utils_log';
import { main, getEnv, call, callTask, metamorph, addWebhook } from './actor';
import AutoscaledPool from './autoscaling/autoscaled_pool';
import BasicCrawler from './crawlers/basic_crawler';
import CheerioCrawler from './crawlers/cheerio_crawler';
import { pushData, openDataset } from './dataset';
import events, { initializeEvents, stopEvents } from './events';
import { getValue, setValue, getInput, openKeyValueStore } from './key_value_store';
import { launchPuppeteer } from './puppeteer';
import PuppeteerCrawler from './crawlers/puppeteer_crawler';
import PuppeteerPool from './puppeteer_pool';
import Request from './request';
import { RequestList, openRequestList } from './request_list';
import { createProxyConfiguration } from './proxy_configuration';
import { openRequestQueue } from './request_queue';
import { apifyClient, getMemoryInfo, isAtHome, publicUtils } from './utils';
import { puppeteerUtils } from './puppeteer_utils';
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
    social: socialUtils,
    log,
    enqueueLinks,
    requestAsBrowser,
});

/**
 * The following section describes all functions and properties provided by the `apify` package,
 * except individual classes and namespaces that have their separate, detailed, documentation pages
 * accessible from the left sidebar. To learn how Apify SDK works, we suggest following
 * the [Getting Started](/docs/guides/getting-started) tutorial.
 *
 * **Important:**
 * > The following functions: `addWebhook`, `call`, `callTask` and Apify Client available under `client` are features of the
 * > [Apify platform](/docs/guides/apify-platform) and require your scripts to be authenticated.
 * > See the [authentication guide](/docs/guides/apify-platform#logging-into-apify-platform-from-apify-sdk) for instructions.
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
    apifyClient as client,
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
    PuppeteerPool,
    PuppeteerCrawler,

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
