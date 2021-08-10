import * as psTree from '@apify/ps-tree';
// eslint-disable-next-line import/no-extraneous-dependencies
import { execSync } from 'child_process';
import * as ApifyClient from 'apify-client';
import { version as apifyClientVersion } from 'apify-client/package.json';
import { ACT_JOB_TERMINAL_STATUSES, ENV_VARS } from '@apify/consts';
import * as cheerio from 'cheerio';
import * as contentTypeParser from 'content-type';
import * as fs from 'fs';
import * as mime from 'mime-types';
import * as os from 'os';
// eslint-disable-next-line import/no-extraneous-dependencies
import ow from 'ow';
import * as path from 'path';
import * as semver from 'semver';
import * as _ from 'underscore';
import { URL } from 'url';
import * as util from 'util';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { IncomingMessage } from 'http';
import { Response as PuppeteerResponse } from 'puppeteer';
import { version as apifyVersion } from '../package.json';
import log from './utils_log';
import * as requestUtils from './utils_request';
import Request, { RequestOptions } from './request';
import { ActorRun } from './typedefs';

/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 * @memberOf utils
 */
const URL_NO_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line
/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 * @memberOf utils
 */
const URL_WITH_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+,.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line

/**
 * Allows turning off the warning that gets printed whenever an actor is run with an outdated SDK on the Apify Platform.
 * @type {string}
 */
const DISABLE_OUTDATED_WARNING = 'APIFY_DISABLE_OUTDATED_WARNING';

const MEMORY_FILE_PATHS = {
    TOTAL: {
        V1: '/sys/fs/cgroup/memory/memory.limit_in_bytes',
        V2: '/sys/fs/cgroup/memory.max',
    },
    USED: {
        V1: '/sys/fs/cgroup/memory/memory.usage_in_bytes',
        V2: '/sys/fs/cgroup/memory.current',
    },
};

// Set encoding to utf-8 so fs.readFile returns string instead of buffer
const MEMORY_FILE_ENCODING = 'utf-8';

const psTreePromised = util.promisify(psTree);

/**
 * Returns a new instance of the Apify API client. The `ApifyClient` class is provided
 * by the <a href="https://www.npmjs.com/package/apify-client" target="_blank">apify-client</a>
 * NPM package, and it is automatically configured using the `APIFY_API_BASE_URL`, and `APIFY_TOKEN`
 * environment variables. You can override the token via the available options. That's useful
 * if you want to use the client as a different Apify user than the SDK internals are using.
 *
 * @param {object} [options]
 * @param {string} [options.token]
 * @param {string} [options.maxRetries]
 * @param {string} [options.minDelayBetweenRetriesMillis]
 * @memberof module:Apify
 * @function
 * @name newClient
 * @return {ApifyClient}
 */
export const newClient = (options = {}) => {
    ow(options, ow.object.exactShape({
        baseUrl: ow.optional.string.url,
        token: ow.optional.string,
        maxRetries: ow.optional.number,
        minDelayBetweenRetriesMillis: ow.optional.number,
    }));
    const {
        baseUrl = process.env[ENV_VARS.API_BASE_URL],
        token = process.env[ENV_VARS.TOKEN],
    } = options;

    return new ApifyClient({
        ...options,
        baseUrl,
        token,
    });
};

/**
 * Logs info about system, node version and apify package version.
 */
export const logSystemInfo = () => {
    log.info('System info', {
        apifyVersion,
        apifyClientVersion,
        osType: os.type(),
        nodeVersion: process.version,
    });
};

/**
 * The default instance of `ApifyClient` used internally
 * by the SDK.
 *
 * @type {*}
 * @ignore
 */
export const apifyClient = newClient();

/**
 * Adds charset=utf-8 to given content type if this parameter is missing.
 *
 * @param {string} contentType
 * @returns {string}
 *
 * @ignore
 */
export const addCharsetToContentType = (contentType) => {
    if (!contentType) return contentType;

    const parsed = contentTypeParser.parse(contentType);

    if (parsed.parameters.charset) return contentType;

    parsed.parameters.charset = 'utf-8';

    return contentTypeParser.format(parsed);
};

let isDockerPromiseCache;
const createIsDockerPromise = () => {
    const promise1 = util
        .promisify(fs.stat)('/.dockerenv')
        .then(() => true)
        .catch(() => false);

    const promise2 = util
        .promisify(fs.readFile)('/proc/self/cgroup', 'utf8')
        .then((content) => content.indexOf('docker') !== -1)
        .catch(() => false);

    return Promise
        .all([promise1, promise2])
        .then(([result1, result2]) => result1 || result2);
};

/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 *
 * @param {boolean} forceReset
 * @return {Promise<boolean>}
 *
 * @memberof utils
 * @name isDocker
 * @function
 */
export const isDocker = (forceReset) => {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromiseCache || forceReset) isDockerPromiseCache = createIsDockerPromise();

    return isDockerPromiseCache;
};

/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 *
 * @param {number[]} arrValues
 * @param {number[]} arrWeights
 * @return {number}
 *
 * @ignore
 */
export const weightedAvg = (arrValues, arrWeights) => {
    const result = arrValues.map((value, i) => {
        const weight = arrWeights[i];
        const sum = value * weight; // eslint-disable-line no-shadow

        return [sum, weight];
    }).reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);

    return result[0] / result[1];
};

/**
 * Describes memory usage of an Actor.
 *
 * @typedef MemoryInfo
 * @property {number} totalBytes Total memory available in the system or container
 * @property {number} freeBytes Amount of free memory in the system or container
 * @property {number} usedBytes Amount of memory used (= totalBytes - freeBytes)
 * @property {number} mainProcessBytes Amount of memory used the current Node.js process
 * @property {number} childProcessesBytes Amount of memory used by child processes of the current Node.js process
 */

/**
 * Returns memory statistics of the process and the system, see {@link MemoryInfo}.
 *
 * If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 *
 * @returns {Promise<MemoryInfo>}
 *
 * @memberof module:Apify
 * @name getMemoryInfo
 * @function
 */
export const getMemoryInfo = async () => {
    // lambda does *not* have `ps` and other command line tools
    // required to extract memory usage.
    const isLambdaEnvironment = process.platform === 'linux'
        && !!process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

    // module.exports must be here so that we can mock it.
    const isDockerVar = !isLambdaEnvironment && (await module.exports.isDocker());

    let mainProcessBytes = -1;
    let childProcessesBytes = 0;

    if (isLambdaEnvironment) {
        // reported in bytes
        mainProcessBytes = process.memoryUsage().rss;

        // https://stackoverflow.com/a/55914335/129415
        childProcessesBytes = execSync('cat /proc/meminfo')
            .toString()
            .split(/[\n: ]/)
            .filter((val) => val.trim())[19]
            // meminfo reports in kb, not bytes
            * 1000
            // the total used memory is reported by meminfo
            // subtract memory used by the main node proces
            // in order to infer memory used by any child processes
            - mainProcessBytes;
    } else {
        // Query both root and child processes
        const processes = await psTreePromised(process.pid, true);

        processes.forEach((rec) => {
            // Skip the 'ps' or 'wmic' commands used by ps-tree to query the processes
            if (rec.COMMAND === 'ps' || rec.COMMAND === 'WMIC.exe') {
                return;
            }
            const bytes = parseInt(rec.RSS, 10);
            // Obtain main process' memory separately
            if (rec.PID === `${process.pid}`) {
                mainProcessBytes = bytes;
                return;
            }
            childProcessesBytes += bytes;
        });
    }

    let totalBytes;
    let usedBytes;
    let freeBytes;

    if (isLambdaEnvironment) {
        // memory size is defined in megabytes
        totalBytes = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, 10) * 1000000;
        usedBytes = mainProcessBytes + childProcessesBytes;
        freeBytes = totalBytes - usedBytes;

        log.debug(`lambda size of ${totalBytes} with ${freeBytes} free bytes`);
    } else if (isDockerVar) {
        // When running inside Docker container, use container memory limits
        // This must be promisified here so that we can mock it.
        const readPromised = util.promisify(fs.readFile);
        const accessPromised = util.promisify(fs.access);

        // Check wheter cgroups V1 or V2 is used
        let cgroupsVersion = 'V1';
        try {
            // If this directory does not exists, assume docker is using cgroups V2
            await accessPromised('/sys/fs/cgroup/memory/', fs.constants.R_OK);
        } catch (err) {
            cgroupsVersion = 'V2';
        }

        try {
            let [totalBytesStr, usedBytesStr] = await Promise.all([
                readPromised(MEMORY_FILE_PATHS.TOTAL[cgroupsVersion], MEMORY_FILE_ENCODING),
                readPromised(MEMORY_FILE_PATHS.USED[cgroupsVersion], MEMORY_FILE_ENCODING),
            ]);

            // Cgroups V2 files contains newline character. Getting rid of it for better handling in later part of the code.
            totalBytesStr = totalBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');
            usedBytesStr = usedBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');

            // Cgroups V2 contains 'max' string if memory is not limited
            // See https://git.kernel.org/pub/scm/linux/kernel/git/tj/cgroup.git/tree/Documentation/admin-guide/cgroup-v2.rst (see "memory.max")
            if (totalBytesStr === 'max') {
                totalBytes = os.totalmem();
            // Cgroups V1 is set to number related to platform and page size if memory is not limited
            // See https://unix.stackexchange.com/q/420906
            } else {
                totalBytes = parseInt(totalBytesStr, 10);
                const containerRunsWithUnlimitedMemory = totalBytes > Number.MAX_SAFE_INTEGER;
                if (containerRunsWithUnlimitedMemory) totalBytes = os.totalmem();
            }
            usedBytes = parseInt(usedBytesStr, 10);
            freeBytes = totalBytes - usedBytes;
        } catch (err) {
            // log.deprecated logs a warning only once
            log.deprecated('Your environment is Docker, but your system does not support memory cgroups. '
                + 'If you\'re running containers with limited memory, memory auto-scaling will not work properly.\n\n'
                + `Cause: ${err.message}`);
            totalBytes = os.totalmem();
            freeBytes = os.freemem();
            usedBytes = totalBytes - freeBytes;
        }
    } else {
        totalBytes = os.totalmem();
        freeBytes = os.freemem();
        usedBytes = totalBytes - freeBytes;
    }

    return {
        totalBytes,
        freeBytes,
        usedBytes,
        mainProcessBytes,
        childProcessesBytes,
    };
};

/**
 * Helper function that returns the first key from plain object.
 *
 * @ignore
 */
export const getFirstKey = (dict) => {
    for (const key in dict) { // eslint-disable-line guard-for-in, no-restricted-syntax
        return key;
    }
};

/**
 * Gets a typical path to Chrome executable, depending on the current operating system.
 *
 * @return {string}
 * @ignore
 */
export const getTypicalChromeExecutablePath = () => {
    switch (os.platform()) {
        case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'win32': return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        default: return '/usr/bin/google-chrome';
    }
};

/**
 * Wraps the provided Promise with another one that rejects with the given errorMessage
 * after the given timeoutMillis, unless the original promise resolves or rejects earlier.
 *
 * @param {Promise<*>} promise
 * @param {number} timeoutMillis
 * @param {string} errorMessage
 * @return {Promise<*>}
 * @ignore
 */
export const addTimeoutToPromise = (promise, timeoutMillis, errorMessage) => {
    return new Promise((resolve, reject) => {
        ow(promise, ow.promise);
        ow(timeoutMillis, ow.number);
        ow(errorMessage, ow.string);
        const timeout = setTimeout(() => reject(new Error(errorMessage)), timeoutMillis);
        promise
            .then(resolve)
            .catch(reject)
            .finally(() => clearTimeout(timeout));
    });
};

/**
 * Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).
 *
 * @returns {boolean}
 *
 * @memberof module:Apify
 * @name isAtHome
 * @function
 */
export const isAtHome = () => !!process.env[ENV_VARS.IS_AT_HOME];

/**
 * Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
 * in your code, e.g. to prevent overloading of target website or to avoid bot detection.
 *
 * **Example usage:**
 *
 * ```
 * const Apify = require('apify');
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await Apify.utils.sleep(1500);
 * ```
 * @param {number} millis Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.
 * @memberof utils
 * @name sleep
 * @function
 * @return {Promise<void>}
 */
export const sleep = (millis) => {
    return new Promise((res) => setTimeout(res, millis));
};

/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 *
 * @param {object} options
 * @param {string} options.url URL to the file
 * @param {string} [options.encoding='utf8'] The encoding of the file.
 * @param {RegExp} [options.urlRegExp=URL_NO_COMMAS_REGEX]
 *   Custom regular expression to identify the URLs in the file to extract.
 *   The regular expression should be case-insensitive and have global flag set (i.e. `/something/gi`).
 * @returns {Promise<Array<string>>}
 * @memberOf utils
 */
const downloadListOfUrls = async (options) => {
    ow(options, ow.object.exactShape({
        url: ow.string.url,
        encoding: ow.optional.string,
        urlRegExp: ow.optional.regExp,
    }));
    const { url, encoding = 'utf8', urlRegExp = URL_NO_COMMAS_REGEX } = options;

    const { requestAsBrowser } = requestUtils;

    const { body: string } = await requestAsBrowser({ url, encoding });
    return extractUrls({ string, urlRegExp });
};

/**
 * Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.
 * @param {object} options
 * @param {string} options.string
 * @param {RegExp} [options.urlRegExp=Apify.utils.URL_NO_COMMAS_REGEX]
 * @returns {string[]}
 * @memberOf utils
 */
const extractUrls = (options) => {
    ow(options, ow.object.exactShape({
        string: ow.string,
        urlRegExp: ow.optional.regExp,
    }));
    const { string, urlRegExp = URL_NO_COMMAS_REGEX } = options;
    return string.match(urlRegExp) || [];
};

// NOTE: We skipping 'noscript' since it's content is evaluated as text, instead of HTML elements. That damages the results.
const SKIP_TAGS_REGEX = /^(script|style|canvas|svg|noscript)$/i;
const BLOCK_TAGS_REGEX = /^(p|h1|h2|h3|h4|h5|h6|ol|ul|li|pre|address|blockquote|dl|div|fieldset|form|table|tr|select|option)$/i;

/**
 * The function converts a HTML document to a plain text.
 *
 * The plain text generated by the function is similar to a text captured
 * by pressing Ctrl+A and Ctrl+C on a page when loaded in a web browser.
 * The function doesn't aspire to preserve the formatting or to be perfectly correct with respect to HTML specifications.
 * However, it attempts to generate newlines and whitespaces in and around HTML elements
 * to avoid merging distinct parts of text and thus enable extraction of data from the text (e.g. phone numbers).
 *
 * **Example usage**
 * ```javascript
 * const text = htmlToText('<html><body>Some text</body></html>');
 * console.log(text);
 * ```
 *
 * Note that the function uses [cheerio](https://www.npmjs.com/package/cheerio) to parse the HTML.
 * Optionally, to avoid duplicate parsing of HTML and thus improve performance, you can pass
 * an existing Cheerio object to the function instead of the HTML text. The HTML should be parsed
 * with the `decodeEntities` option set to `true`. For example:
 *
 * ```javascript
 * const cheerio = require('cheerio');
 * const html = '<html><body>Some text</body></html>';
 * const text = htmlToText(cheerio.load(html, { decodeEntities: true }));
 * ```
 * @param {(string|cheerio.Root)} html HTML text or parsed HTML represented using a
 * [cheerio](https://www.npmjs.com/package/cheerio) function.
 * @return {string} Plain text
 * @memberOf utils
 * @function
 */
const htmlToText = (html) => {
    if (!html) return '';

    // TODO: Add support for "html" being a Cheerio element, otherwise the only way
    //  to use it is e.g. htmlToText($('p').html())) which is inefficient
    //  Also, it seems this doesn't work well in CheerioScraper, e.g. htmlToText($)
    //  produces really text with a lot of HTML elements in it. Let's just deprecate this sort of usage,
    //  and make the parameter "htmlOrCheerioElement"
    /**
     * @type {cheerio.Root}
     * @ignore
     */
    const $ = typeof html === 'function' ? html : cheerio.load(html, { decodeEntities: true });
    let text = '';

    const process = (elems) => {
        const len = elems ? elems.length : 0;
        for (let i = 0; i < len; i++) {
            const elem = elems[i];
            if (elem.type === 'text') {
                // Compress spaces, unless we're inside <pre> element
                let compr;
                if (elem.parent && elem.parent.tagName === 'pre') compr = elem.data;
                else compr = elem.data.replace(/\s+/g, ' ');
                // If text is empty or ends with a whitespace, don't add the leading whitepsace
                if (compr.startsWith(' ') && /(^|\s)$/.test(text)) compr = compr.substr(1);
                text += compr;
            } else if (elem.type === 'comment' || SKIP_TAGS_REGEX.test(elem.tagName)) {
                // Skip comments and special elements
            } else if (elem.tagName === 'br') {
                text += '\n';
            } else if (elem.tagName === 'td') {
                process(elem.children);
                text += '\t';
            } else {
                // Block elements must be surrounded by newlines (unless beginning of text)
                const isBlockTag = BLOCK_TAGS_REGEX.test(elem.tagName);
                if (isBlockTag && !/(^|\n)$/.test(text)) text += '\n';
                process(elem.children);
                if (isBlockTag && !text.endsWith('\n')) text += '\n';
            }
        }
    };

    // If HTML document has body, only convert that, otherwise convert the entire HTML
    const $body = $('body');
    process($body.length > 0 ? $body : $.root());

    return text.trim();
};

/**
 * Creates a standardized debug info from request and response. This info is usually added to dataset under the hidden `#debug` field.
 *
 * @param {(Request|RequestOptions)} request [Apify.Request](https://sdk.apify.com/docs/api/request) object.
 * @param {(*|IncomingMessage|PuppeteerResponse)} [response]
 *   Puppeteer [`Response`](https://pptr.dev/#?product=Puppeteer&version=v1.11.0&show=api-class-response)
 *   or NodeJS [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_serverresponse).
 * @param {Object<string, *>} [additionalFields] Object containing additional fields to be added.

 * @return {Object<string, *>}
 */
const createRequestDebugInfo = (request, response = {}, additionalFields = {}) => {
    ow(request, ow.object);
    ow(response, ow.object);
    ow(additionalFields, ow.object);

    return {
        requestId: request.id,
        url: request.url,
        loadedUrl: request.loadedUrl,
        method: request.method,
        retryCount: request.retryCount,
        errorMessages: request.errorMessages,
        // Puppeteer response has .status() funtion and NodeJS response ,statusCode property.
        statusCode: _.isFunction(response.status) ? response.status() : response.statusCode,
        ...additionalFields,
    };
};

/**
 * Converts SNAKE_CASE to camelCase.
 *
 * @param {string} snakeCaseStr
 * @return {string}
 * @ignore
 */
export const snakeCaseToCamelCase = (snakeCaseStr) => {
    return snakeCaseStr
        .toLowerCase()
        .split('_')
        .map((part, index) => {
            return index > 0
                ? part.charAt(0).toUpperCase() + part.slice(1)
                : part;
        })
        .join('');
};

/**
 * Prints a warning if this version of Apify SDK is outdated.
 *
 * @ignore
 */
export const printOutdatedSdkWarning = () => {
    if (process.env[DISABLE_OUTDATED_WARNING]) return;
    const latestApifyVersion = process.env[ENV_VARS.SDK_LATEST_VERSION];
    if (!latestApifyVersion || !semver.lt(apifyVersion, latestApifyVersion)) return;

    // eslint-disable-next-line
    log.warning(`You are using an outdated version (${apifyVersion}) of Apify SDK. We recommend you to update to the latest version (${latestApifyVersion}).
         Read more about Apify SDK versioning at: https://help.apify.com/en/articles/3184510-updates-and-versioning-of-apify-sdk`);
};

/**
 * Gets parsed content type from response object
 * @param {IncomingMessage} response - HTTP response object
 * @return {{ type: string, charset: string }}
 * @ignore
 */
export const parseContentTypeFromResponse = (response) => {
    ow(response, ow.object.partialShape({
        url: ow.string.url,
        headers: ow.object,
    }));

    const { url, headers } = response;
    let parsedContentType;

    if (headers['content-type']) {
        try {
            parsedContentType = contentTypeParser.parse(headers['content-type']);
        } catch (err) {
            // Can not parse content type from Content-Type header. Try to parse it from file extension.
        }
    }

    // Parse content type from file extension as fallback
    if (!parsedContentType) {
        const parsedUrl = new URL(url);
        const contentTypeFromExtname = mime.contentType(path.extname(parsedUrl.pathname))
            || 'application/octet-stream; charset=utf-8'; // Fallback content type, specified in https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        parsedContentType = contentTypeParser.parse(contentTypeFromExtname);
    }

    return {
        type: parsedContentType.type,
        charset: parsedContentType.parameters.charset,
    };
};

/**
 * Returns a promise that resolves with the finished Run object when the provided actor run finishes
 * or with the unfinished Run object when the `waitSecs` timeout lapses. The promise is NOT rejected
 * based on run status. You can inspect the `status` property of the Run object to find out its status.
 *
 * This is useful when you need to chain actor executions. Similar effect can be achieved
 * by using webhooks, so be sure to review which technique fits your use-case better.
 *
 * @param {object} options
 * @param {string} options.actorId
 *  ID of the actor that started the run.
 * @param {string} options.runId
 *  ID of the run itself.
 * @param {string} [options.waitSecs]
 *  Maximum time to wait for the run to finish, in seconds.
 *  If the limit is reached, the returned promise is resolved to a run object that will have
 *  status `READY` or `RUNNING`. If `waitSecs` omitted, the function waits indefinitely.
 * @param {string} [options.token]
 *  You can supply an Apify token to override the default one
 *  that's used by the default ApifyClient instance.
 *  E.g. you can track other users' runs.
 * @returns {Promise<ActorRun>}
 * @memberOf utils
 * @name waitForRunToFinish
 * @function
 * @deprecated
 *  Please use the 'waitForFinish' functions of 'apify-client'.
 * @ignore
 */
export const waitForRunToFinish = async (options) => {
    ow(options, ow.object.exactShape({
        actorId: ow.string,
        runId: ow.string,
        waitSecs: ow.optional.number,
    }));

    const {
        actorId,
        runId,
        waitSecs,
    } = options;
    let run;

    const startedAt = Date.now();
    const shouldRepeat = () => {
        if (waitSecs && (Date.now() - startedAt) / 1000 >= waitSecs) return false;
        if (run && ACT_JOB_TERMINAL_STATUSES.includes(run.status)) return false;

        return true;
    };

    while (shouldRepeat()) {
        const waitForFinish = waitSecs
            ? Math.round(waitSecs - (Date.now() - startedAt) / 1000)
            : 999999;

        run = await apifyClient.run(runId, actorId).waitForFinish({ waitSecs: waitForFinish });

        // It might take some time for database replicas to get up-to-date,
        // so getRun() might return null. Wait a little bit and try it again.
        if (!run) await sleep(250);
    }

    if (!run) {
        throw new Error('Waiting for run to finish failed. Cannot fetch actor run details from the server.');
    }

    return run;
};

/**
 * A namespace that contains various utilities.
 *
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await Apify.utils.sleep(1500);
 * ```
 * @namespace utils
 */
export const publicUtils = {
    isDocker,
    sleep,
    downloadListOfUrls,
    extractUrls,
    htmlToText,
    URL_NO_COMMAS_REGEX,
    URL_WITH_COMMAS_REGEX,
    createRequestDebugInfo,
    waitForRunToFinish,
};
