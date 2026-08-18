/**
 * Helpers for remote-browser integration tests.
 *
 * These tests require a running Browserless instance and a deterministic HTTP
 * target (httpbin). In CI both are provided as GitHub Actions service
 * containers on a shared network. Locally, start them via
 * `pnpm test:integration:services:up`.
 *
 * Network model: HTTPBIN_URL is consumed by the REMOTE browser (not the test
 * runner). The browser lives in the Browserless container, so the URL must
 * resolve inside that container's Docker network — typically `http://httpbin`
 * via service name/alias.
 *
 * Env vars:
 *   BROWSERLESS_URL  default: http://localhost:3000   (host-side; how the test
 *                                                      runner reaches CDP)
 *   HTTPBIN_URL      default: http://httpbin          (browser-side; how the
 *                                                      remote browser reaches
 *                                                      httpbin via Docker DNS)
 */
export declare const BROWSERLESS_URL: string;
export declare const HTTPBIN_URL: string;
/** Build a URL on the httpbin service from a path (e.g. '/cookies'). */
export declare function httpbin(path: string): string;
