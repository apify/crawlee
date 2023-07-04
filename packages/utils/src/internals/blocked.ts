/**
 * CSS selectors for elements that should trigger a retry, as the crawler is likely getting blocked.
 */
export const RETRY_CSS_SELECTORS = [
    'iframe[src^="https://challenges.cloudflare.com"]',
    'div#infoDiv0 a[href*="//www.google.com/policies/terms/"]',
];
