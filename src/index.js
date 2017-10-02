import EventEmitter from 'events';

import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, readyFreddy, getEnv, getValue, setValue, apifyClient, call } from './actor';
import { browse } from './browser';

/* globals module */

// Publicly available functions
const Apify = {
    main,
    getEnv,
    getValue,
    setValue,
    call,
    readyFreddy,
    setPromisesDependency,
    getPromisesDependency,
    browse,
    client: apifyClient,
    events: new EventEmitter(),
};

/**
 * Helper package that simplifies development of Apify acts.
 * @module Apify
 * @description Basic usage of Apify module in Apify acts:
 * ```javascript
 * const Apify = require('apify');
 *
 * Apify.main(() => {
 *   // my synchronous function that returns immediately
 * });
 * ```
 */
module.exports = Apify;
