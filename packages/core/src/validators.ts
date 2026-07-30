import { schemas } from '@crawlee/utils/internal';

export { ArgumentValidationError, parseArgument, schemas } from '@crawlee/utils';

/** @internal */
export const validators = {
    // Naming it browser page for future proofing with Playwright
    browserPage: schemas.objectWithKeys(
        ['goto', 'evaluate', '$', 'on'],
        'Expected a Puppeteer Page, got something else.',
    ),
    proxyConfiguration: schemas.objectWithKeys(
        ['newProxyInfo'],
        "Expected an object implementing the IProxyConfiguration interface (missing 'newProxyInfo'), got something else.",
    ),
    requestList: schemas.objectWithKeys(
        ['fetchNextRequest', 'persistState'],
        'Expected a RequestList, got something else.',
    ),
    requestQueue: schemas.objectWithKeys(
        ['fetchNextRequest', 'addRequest'],
        'Expected a RequestQueue, got something else.',
    ),
    browserPool: schemas.objectWithKeys(
        ['newPage', 'closePage', 'extractPageState', 'injectPageState'],
        "Expected an object implementing the IBrowserPool interface (missing one of 'newPage', 'closePage', 'extractPageState', 'injectPageState'), got something else.",
    ),
    sessionPool: schemas.objectWithKeys(
        ['getSession'],
        "Expected an object implementing the ISessionPool interface (missing 'getSession'), got something else.",
    ),
};
