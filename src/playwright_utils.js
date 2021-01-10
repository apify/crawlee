import ow from 'ow';
import _ from 'underscore';
import { Page, Response, DirectNavigationOptions } from 'playwright'; // eslint-disable-line no-unused-vars
import log from './utils_log';
import { validators } from './validators';
/**
 * Extended version of Playwright's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Apify.Request class.
 *
 * *NOTE:* In recent versions of Playwright using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param {Page} page
 *   Puppeteer [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param {Request} request
 * @param {DirectNavigationOptions} [gotoOptions] Custom options for `page.goto()`.
 * @return {Promise<(Response | null)>}
 *
 * @memberOf playwright
 * @name gotoExtended
 */
export const gotoExtended = async (page, request, gotoOptions = {}) => {
    ow(page, ow.object.validate(validators.browserPage));
    ow(request, ow.object.partialShape({
        url: ow.string.url,
        method: ow.optional.string,
        headers: ow.optional.object,
        payload: ow.optional.any(ow.string, ow.buffer),
    }));
    ow(gotoOptions, ow.object);

    const { url, method, headers, payload } = request;

    if (method !== 'GET' || payload || !_.isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Playwright. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = (route) => {
            // We want to ensure that this won't get executed again in a case that there is a subsequent request
            // for example for some asset file link from main HTML.
            if (wasCalled) {
                return route.continue();
            }

            wasCalled = true;
            const overrides = {};

            if (method !== 'GET') overrides.method = method;
            if (payload) overrides.postData = payload;
            if (!_.isEmpty(headers)) overrides.headers = headers;
            route.continue(overrides);
        };

        await page.route('**/*', interceptRequestHandler);
    }

    return page.goto(url, gotoOptions);
};

export const playwrightUtils = {
    gotoExtended,
};
