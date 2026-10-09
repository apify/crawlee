export const CLOUDFLARE_RETRY_CSS_SELECTORS = ['#turnstile-wrapper iframe[src^="https://challenges.cloudflare.com"]'];

/**
 * The AWS WAF interstitials: the JS challenge, served with a `202` status, and the CAPTCHA it escalates to, served with a `405`.
 * Neither status is a blocked one. Matching the container as a direct child of `<body>` keeps regular pages
 * that load the AWS WAF integration scripts, or embed the CAPTCHA into their own markup, from matching.
 */
export const AWS_WAF_RETRY_CSS_SELECTORS = [
    'html:has(> head > script[src*=".awswaf.com/"][src$="/challenge.js"]) > body > #challenge-container',
    'html:has(> head > script[src*=".awswaf.com/"][src$="/captcha.js"]) > body > #captcha-container',
];

/**
 * CSS selectors for elements that should trigger a retry, as the crawler is likely getting blocked.
 */
export const RETRY_CSS_SELECTORS = [
    ...CLOUDFLARE_RETRY_CSS_SELECTORS,
    ...AWS_WAF_RETRY_CSS_SELECTORS,
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
