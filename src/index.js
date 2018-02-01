import EventEmitter from 'events';

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
import { setPromisesDependency, getPromisesDependency, apifyClient, getMemoryInfo } from './utils';
import { browse, launchWebDriver } from './webdriver';

/* globals module */

// Publicly available functions
// @TODO check that all tests are done against Apify.* not *
const Apify = {
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
    setPromisesDependency,
    getPromisesDependency,

    // Webdriver
    browse,
    launchWebDriver,
};

/**
 * @module Apify
 * @description
 * <p>
 * The `apify` NPM package simplifies development of acts in Apify Actor -
 * a serverless computing platform that enables execution of arbitrary pieces of code in the cloud.
 * The package provides helper functions to launch web browsers with proxies,
 * access the storage etc. Note that the usage of the package is optional,
 * you can create acts without it.
 * </p>
 * <p>
 * For more information about the Apify Actor platform, please go to
 * {@link https://www.apify.com/docs/actor|Actor documentation}.
 * The source code of this package is available on {@link https://github.com/apifier/apify-runtime-js|GitHub}.
 * </p>
 *
 * <h2>Example usage</h2>
 * <pre><code class="language-javascript">const Apify = require('apify');
 * &nbsp;
 * Apify.main(async () => {
 *   // Get input of the act
 *   const input = await Apify.getValue('INPUT');
 *   console.dir(input);
 * &nbsp;
 *   // Do something useful here...
 *   const browser = await Apify.launchPuppeteer();
 *   const page = await browser.newPage();
 *   await page.goto('http://www.example.com');
 *   const pageTitle = await page.title();
 * &nbsp;
 *   // Save output
 *   await Apify.setValue('OUTPUT', { pageTitle });
 * });</code></pre>
 *
 * <h2>Installation</h2>
 * <p>This package requires Node.js 6 or higher. It might work with lower versions too,
 * but they are neither tested nor supported.
 * To install the package locally, run the following command in your Node.js project:</p>
 * ```bash
 * npm install apify --save
 * ```
 * <p>
 * <h2>Promises vs. callbacks</h2>
 * <p>
 * By default, all asynchronous functions provided by this package return a promise.
 * However, most of them also accept an optional Node.js-style callback as the last parameter.
 * If the callback is provided, the return value of the functions is not defined
 * and the functions only invoke the callback upon completion or error.
 * </p>
 * <p>
 * To set a promise dependency from an external library,
 * use the <a href="#module-Apify-setPromisesDependency"><code>Apify.setPromisesDependency()</code></a> function.
 * If this function is not called, the runtime defaults to
 * native promises if they are available, or it throws an error.
 * </p>
 * <h2>Programmer's reference</h2>
 * <p>The following sections describe all functions and properties provided by the `apify` package.
 * All of them are instance members exported directly by the main module.
 * </p>
 */
module.exports = Apify;
