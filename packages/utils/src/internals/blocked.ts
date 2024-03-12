export const CLOUDFLARE_RETRY_CSS_SELECTORS = ['#turnstile-wrapper iframe[src^="https://challenges.cloudflare.com"]'];

/**
 * CSS selectors for elements that should trigger a retry, as the crawler is likely getting blocked.
 */
export const RETRY_CSS_SELECTORS = [
    ...CLOUDFLARE_RETRY_CSS_SELECTORS,
    'div#infoDiv0 a[href*="//www.google.com/policies/terms/"]',
    'iframe[src*="_Incapsula_Resource"]',
];

/**
 * Content of proxy errors that should trigger a retry, as the proxy is likely getting blocked / is malfunctioning.
 */
export const ROTATE_PROXY_ERRORS = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ERR_PROXY_CONNECTION_FAILED',
    'ERR_TUNNEL_CONNECTION_FAILED',
    'Proxy responded with',
];
