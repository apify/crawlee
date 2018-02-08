import EventEmitter from 'events';
import { log } from 'apify-shared';

import { main, readyFreddy, getEnv, call, getApifyProxyUrl } from './actor';
import AutoscaledPool from './autoscaled_pool';
import BasicCrawler from './basic_crawler';
import { pushData, openDataset } from './dataset';
import { getValue, setValue, openKeyValueStore } from './key_value_store';
import { launchPuppeteer } from './puppeteer';
import PuppeteerCrawler from './puppeteer_crawler';
import PuppeteerPool from './puppeteer_pool';
import Request from './request';
import RequestList from './request_list';
import SettingsRotator from './settings_rotator';
import { apifyClient, getMemoryInfo, isProduction } from './utils';
import { browse, launchWebDriver } from './webdriver';

/* globals module */

// Hide debug log messages when running in production mode.
if (!isProduction()) log.isDebugMode = true;

/**
 * The `apify` NPM package simplifies development of acts in Apify Actor -
 * a serverless computing platform that enables execution of arbitrary pieces of code in the cloud.
 * The package provides helper functions to launch web browsers with proxies,
 * access the storage etc. Note that the usage of the package is optional,
 * you can create acts without it.
 *
 * For more information about the Apify Actor platform, please go to
 * {@link https://www.apify.com/docs/actor|Actor documentation}.

 * The source code of this package is available on {@link https://github.com/apifytech/apify-runtime-js|GitHub}.
 *
 * <h2>Example usage</h2>
 *
 * ```javascript
 * &nbsp;
 * Apify.main(async () => {
 *     // Get input of the act
 *     const input = await Apify.getValue('INPUT');
 *     console.dir(input);
 * &nbsp;
 *     // Do something useful here...
 *     const browser = await Apify.launchPuppeteer();
 *     const page = await browser.newPage();
 *     await page.goto('http://www.example.com');
 *     const pageTitle = await page.title();
 * &nbsp;
 *     // Save output
 *     await Apify.setValue('OUTPUT', { pageTitle });
 * });
 * ```
 *
 * <h2>Installation</h2>
 *
 * This package requires Node.js 6 or higher. It might work with lower versions too,
 * but they are neither tested nor supported.
 *
 * To install the package locally, run the following command in your Node.js project:
 *
 * ```bash
 * npm install apify --save
 * ```
 *
 * <h2>Promises vs. callbacks</h2>
 *
 * By default, all asynchronous functions provided by this package return a promise.
 * However, most of them also accept an optional Node.js-style callback as the last parameter.
 * If the callback is provided, the return value of the functions is not defined
 * and the functions only invoke the callback upon completion or error.
 *
 * <h2>Programmer's reference</h2>
 *
 * The following sections describe all functions and properties provided by the `apify` package.
 * All of them are instance members exported directly by the main module.
 *
 * @module Apify
 */
module.exports = {
    events: new EventEmitter(),

    // Actor
    main,
    getEnv,
    call,
    readyFreddy,
    getMemoryInfo,
    getApifyProxyUrl,

    // Autoscaled pool
    AutoscaledPool,

    // Basic crawler
    BasicCrawler,

    // Dataset
    pushData,
    openDataset,

    // Key value store
    getValue,
    setValue,
    openKeyValueStore,

    // Puppeteer
    launchPuppeteer,
    PuppeteerPool,
    PuppeteerCrawler,

    // Request
    Request,
    RequestList,

    // Settings rotator
    SettingsRotator,

    // Utils
    client: apifyClient,

    // Webdriver
    browse,
    launchWebDriver,
};
