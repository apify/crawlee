/// <reference path="../src/utils_log.d.ts" />
import { main } from "./actor";
import { getEnv } from "./actor";
import { call } from "./actor";
import { callTask } from "./actor";
import { metamorph } from "./actor";
import { getMemoryInfo } from "./utils";
import { getApifyProxyUrl } from "./actor";
import { isAtHome } from "./utils";
import { apifyClient } from "./utils";
import { addWebhook } from "./actor";
import AutoscaledPool from "./autoscaling/autoscaled_pool";
import BasicCrawler from "./crawlers/basic_crawler";
import CheerioCrawler from "./crawlers/cheerio_crawler";
import { pushData } from "./dataset";
import { openDataset } from "./dataset";
import events from "./events";
import { initializeEvents } from "./events";
import { stopEvents } from "./events";
import { getValue } from "./key_value_store";
import { setValue } from "./key_value_store";
import { getInput } from "./key_value_store";
import { openKeyValueStore } from "./key_value_store";
import { launchPuppeteer } from "./puppeteer";
import PuppeteerPool from "./puppeteer_pool";
import PuppeteerCrawler from "./crawlers/puppeteer_crawler";
import PseudoUrl from "./pseudo_url";
import Request from "./request";
import { RequestList } from "./request_list";
import { openRequestList } from "./request_list";
import { openRequestQueue } from "./request_queue";
import { openSessionPool } from "./session_pool/session_pool";
import LiveViewServer from "./live_view/live_view_server";
import { Session } from "./session_pool/session";
declare const exportedUtils: {
    isDocker: (forceReset: boolean) => Promise<boolean>;
    sleep: (millis: number) => Promise<void>;
    downloadListOfUrls: ({ url, encoding, urlRegExp }: {
        url: string;
        encoding?: string;
        urlRegExp?: RegExp;
    }) => Promise<string[]>;
    extractUrls: ({ string, urlRegExp }: {
        string: string;
        urlRegExp?: RegExp;
    }) => string[];
    getRandomUserAgent: () => string;
    htmlToText: (html: string | CheerioStatic) => string;
    URL_NO_COMMAS_REGEX: RegExp;
    URL_WITH_COMMAS_REGEX: RegExp;
    createRequestDebugInfo: (request: any, response?: import("http").IncomingMessage | import("puppeteer").Response, additionalFields?: any) => any;
    parseContentTypeFromResponse: (response: any) => {
        type: string;
        charset: string;
    };
} & {
    puppeteer: {
        hideWebDriver: (page: import("puppeteer").Page) => Promise<any>;
        injectFile: (page: import("puppeteer").Page, filePath: string, options?: {
            surviveNavigations?: boolean;
        }) => Promise<any>;
        injectJQuery: (page: import("puppeteer").Page) => Promise<any>;
        injectUnderscore: (page: import("puppeteer").Page) => Promise<any>;
        enqueueRequestsFromClickableElements: (page: any, selector: any, purls: any, requestQueue: any, requestOpts?: {}) => Promise<any[]>;
        enqueueLinks: (...args: any[]) => Promise<import("./request_queue").QueueOperationInfo[]>;
        enqueueLinksByClickingElements: typeof import("./enqueue_links/click_elements").enqueueLinksByClickingElements;
        blockRequests: (page: import("puppeteer").Page, options?: {
            urlPatterns?: string[];
            extraUrlPatterns?: string[];
        }) => Promise<any>;
        blockResources: (page: any, resourceTypes?: string[]) => Promise<void>;
        cacheResponses: (page: import("puppeteer").Page, cache: any, responseUrlRules: (string | RegExp)[]) => Promise<any>;
        compileScript: (scriptString: string, context?: any) => Function;
        gotoExtended: (page: import("puppeteer").Page, request: Request, gotoOptions?: any) => Promise<import("puppeteer").Response>;
        addInterceptRequestHandler: (page: any, handler: Function) => Promise<any>;
        removeInterceptRequestHandler: (page: any, handler: Function) => Promise<any>;
        infiniteScroll: (page: any, options?: {
            timeoutSecs?: number;
            waitForSecs?: number;
        }) => Promise<any>;
        saveSnapshot: (page: any, options?: {
            key?: string;
            screenshotQuality?: number;
            saveScreenshot?: boolean;
            saveHtml?: boolean;
            keyValueStoreName?: string;
        }) => Promise<any>;
    };
    social: {
        emailsFromText: (text: string) => string[];
        emailsFromUrls: (urls: string[]) => string[];
        phonesFromText: (text: string) => string[];
        phonesFromUrls: (urls: string[]) => string[];
        parseHandlesFromHtml: (html: string, data?: any) => import("./utils_social").SocialHandles;
        EMAIL_REGEX: RegExp;
        EMAIL_REGEX_GLOBAL: RegExp;
        LINKEDIN_REGEX: RegExp;
        LINKEDIN_REGEX_GLOBAL: RegExp;
        INSTAGRAM_REGEX: RegExp;
        INSTAGRAM_REGEX_GLOBAL: RegExp;
        TWITTER_REGEX: RegExp;
        TWITTER_REGEX_GLOBAL: RegExp;
        FACEBOOK_REGEX: RegExp;
        FACEBOOK_REGEX_GLOBAL: RegExp;
        YOUTUBE_REGEX: RegExp;
        YOUTUBE_REGEX_GLOBAL: RegExp;
    };
    log: typeof log;
    enqueueLinks: typeof enqueueLinks;
    requestAsBrowser: (options: import("./utils_request").RequestAsBrowserOptions) => Promise<any>;
};
import { enqueueLinks } from "./enqueue_links/enqueue_links";
export { main, getEnv, call, callTask, metamorph, getMemoryInfo, getApifyProxyUrl, isAtHome, apifyClient as client, addWebhook, AutoscaledPool, BasicCrawler, CheerioCrawler, pushData, openDataset, events, initializeEvents, stopEvents, getValue, setValue, getInput, openKeyValueStore, launchPuppeteer, PuppeteerPool, PuppeteerCrawler, PseudoUrl, Request, RequestList, openRequestList, openRequestQueue, openSessionPool, LiveViewServer, Session, exportedUtils as utils };

export { ApifyEnv } from './actor'
export { DatasetContent, DatasetConsumer, DatasetMapper, DatasetReducer } from './dataset'
export { KeyConsumer } from './key_value_store'
export { LaunchPuppeteerOptions } from './puppeteer'
export { PuppeteerPoolOptions } from './puppeteer_pool'
export { RequestOptions } from './request'
export { RequestListOptions, RequestListState } from './request_list'
export { QueueOperationInfo } from './request_queue'
export { Cheerio, ActorRun } from './typedefs'
export { MemoryInfo } from './utils'
export { RequestAsBrowserOptions } from './utils_request'
export { SocialHandles } from './utils_social'
export { AutoscaledPoolOptions } from './autoscaling/autoscaled_pool'
export { SnapshotterOptions } from './autoscaling/snapshotter'
export { SystemInfo, SystemStatusOptions } from './autoscaling/system_status'
export { BasicCrawlerOptions, HandleRequest, HandleRequestInputs, HandleFailedRequest, HandleFailedRequestInput } from './crawlers/basic_crawler'
export { CheerioCrawlerOptions, PrepareRequestInputs, PrepareRequest, CheerioHandlePageInputs, CheerioHandlePage } from './crawlers/cheerio_crawler'
export { PuppeteerCrawlerOptions, PuppeteerHandlePageInputs, PuppeteerHandlePage, PuppeteerGotoInputs, PuppeteerGoto, LaunchPuppeteer } from './crawlers/puppeteer_crawler'
export { RequestTransform } from './enqueue_links/shared'
export { SessionState, SessionOptions } from './session_pool/session'
export { CreateSession, SessionPoolOptions } from './session_pool/session_pool'
export { StealthOptions } from './stealth/stealth'