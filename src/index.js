import log from 'apify-shared/log';
import { ENV_VARS } from './constants';
import { main, getEnv, call, getApifyProxyUrl } from './actor';
import AutoscaledPool from './autoscaled_pool';
import BasicCrawler from './basic_crawler';
import CheerioCrawler from './cheerio_crawler';
import { pushData, openDataset } from './dataset';
import events, { initializeEvents, stopEvents } from './events';
import { getValue, setValue, openKeyValueStore } from './key_value_store';
import { launchPuppeteer } from './puppeteer';
import PuppeteerCrawler from './puppeteer_crawler';
import PuppeteerPool from './puppeteer_pool';
import Request from './request';
import RequestList from './request_list';
import { openRequestQueue } from './request_queue';
import SettingsRotator from './settings_rotator';
import { apifyClient, getMemoryInfo, isProduction, isAtHome, publicUtils } from './utils';
import { browse, launchWebDriver } from './webdriver';
import { puppeteerUtils } from './puppeteer_utils';
import PseudoUrl from './pseudo_url';

/* globals module */

// Hide debug log messages when running in production mode.
if (!isProduction() || process.env[ENV_VARS.LOG_LEVEL] === 'DEBUG') log.isDebugMode = true;

// Log as plain text not JSON
log.logJson = false;

/**
 *{include-readme-1}
 *{include-readme-2}
 *{include-readme-3}
 *
 * <h2>Programmer's reference</h2>
 *
 * The following sections describe all functions and properties provided by the `apify` package.
 * All of them are instance members exported directly by the main module.
 *
 * @module Apify
 */
module.exports = {
    // Actor
    main,
    getEnv,
    call,
    getMemoryInfo,
    getApifyProxyUrl,
    isAtHome,
    client: apifyClient,

    // Autoscaled pool
    AutoscaledPool,

    // Basic crawler
    BasicCrawler,

    // Cheerio crawler
    CheerioCrawler,

    // Dataset
    pushData,
    openDataset,

    // Events
    events,
    initializeEvents,
    stopEvents,

    // Key-value store
    getValue,
    setValue,
    openKeyValueStore,

    // Puppeteer
    launchPuppeteer,
    PuppeteerPool,
    PuppeteerCrawler,

    // PseudoUrl
    PseudoUrl,

    // Requests
    Request,
    RequestList,
    openRequestQueue,

    // Settings rotator
    SettingsRotator,

    // Webdriver
    browse,
    launchWebDriver,

    // utils
    utils: Object.assign(publicUtils, {
        puppeteer: puppeteerUtils,
    }),
};
