import EventEmitter from 'events';
import { log } from 'apify-shared';

import { ENV_VARS } from './constants';
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
if (!isProduction() || process.env[ENV_VARS.LOG_LEVEL] === 'DEBUG') log.isDebugMode = true;

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
 * <h2>Main use-cases</h2>
 *
 * Main goal of this package is to help with implementation of web scraping and automation projects. Some of the
 * most common use-cases are:
 *
 * <ul>
 *   <li>
 *     If you need to process high volume of <strong>asynchronous tasks in parallel</strong> then take a
 *     look at <a href="#AutoscaledPool">AutoscaledPool</a>. This class executes defined tasks in a pool
 *     which size is scaled based on available memory and CPU.
 *   </li>
 *   <li>
 *     If you want to <strong>crawl</strong> a list of urls using for example <a href="https://www.npmjs.com/package/request" target="_blank">
 *     Request</a> package then import those url as a <a href="#RequestList">RequestList</a> and then use
 *     <a href="#BasicCrawler">BasicCrawler</a> to process them in a pool.
 *   </li>
 *   <li>
 *     If you want to crawl a list of urls but you need a real <strong>browser</strong>. Then use
 *     <a href="#PuppeteerCrawler">PuppeteerCrawler</a> which helps you to process a <a href="#RequestList">RequestList</a>
 *     using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser).
 *   </li>
 * </ul>
 *
 * <h2>Puppeteer</h2>
 *
 * For those who are using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a> (headless Chrome browser)
 * we have few helper classes and functions:
 *
 * <ul>
 *   <li>
 *     `Apify.launchPuppeteer()` function starts new instance of Puppeteer browser and returns its browser object.
 *   </li>
 *   <li>
 *     <a href="#PuppeteerPool">PuppeteerPool</a> helps to mantain a pool of Puppeteer instances. This is usefull
 *     when you need to restart browser after certain number of requests to rotate proxy servers.
 *   </li>
 *   <li>
 *       <a href="#PuppeteerCrawler">PuppeteerCrawler</a> helps to crawl a <a href="#RequestList">RequestList</a>
 *       in a autoscaled pool.
 *   </li>
 * </ul>
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
 * But Apify uses a <a href="http://bluebirdjs.com/" target="_blank">Bluebird</a>
 * promise implementation so you can easily convert any function that returns a Promise
 * into callback style function. See <a href="http://bluebirdjs.com/docs/api/promise.promisify.html" target="_blank">
 * http://bluebirdjs.com/docs/api/promise.promisify.html
 * </a> for more information.
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
