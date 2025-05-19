export * from '@crawlee/browser';
export * from './internals/puppeteer-crawler.js';
export * from './internals/puppeteer-launcher.js';

export * as puppeteerRequestInterception from './internals/utils/puppeteer_request_interception.js';
export type { InterceptHandler } from './internals/utils/puppeteer_request_interception.js';

export * as puppeteerUtils from './internals/utils/puppeteer_utils.js';
export type {
    BlockRequestsOptions,
    CompiledScriptFunction,
    CompiledScriptParams,
    DirectNavigationOptions as PuppeteerDirectNavigationOptions,
    InfiniteScrollOptions,
    InjectFileOptions,
    SaveSnapshotOptions,
} from './internals/utils/puppeteer_utils.js';

export * as puppeteerClickElements from './internals/enqueue-links/click-elements.js';
export type { EnqueueLinksByClickingElementsOptions } from './internals/enqueue-links/click-elements.js';
